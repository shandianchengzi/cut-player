#define _GNU_SOURCE
#include <jni.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/wait.h>
#include <signal.h>
#include <stdatomic.h>
#include <stdlib.h>
#include <errno.h>
static _Atomic int active_pid = 0;
static _Atomic int cancelled = 0;
JNIEXPORT void JNICALL Java_io_github_shandianchengzi_cutplayer_NativeRunner_reset(JNIEnv *e,jclass c){(void)e;(void)c;atomic_store(&cancelled,0);}
JNIEXPORT void JNICALL Java_io_github_shandianchengzi_cutplayer_NativeRunner_cancel(JNIEnv *e,jclass c){(void)e;(void)c;atomic_store(&cancelled,1);int pid=atomic_load(&active_pid);if(pid>0)kill(pid,SIGTERM);}
JNIEXPORT jint JNICALL Java_io_github_shandianchengzi_cutplayer_NativeRunner_execute(JNIEnv *env,jclass cls,jstring executable,jobjectArray arguments,jint input,jint output,jobject sink){
 (void)cls;
 int count=(*env)->GetArrayLength(env,arguments),pipes[2]={-1,-1},in=-1,out=-1,writer=-1,result=-1;
 const char *binary=(*env)->GetStringUTFChars(env,executable,NULL);
 char **argv=calloc((size_t)count+2,sizeof(char*));jstring *strings=calloc((size_t)count,sizeof(jstring));
 if(!argv||!strings||!binary)goto cleanup;
 argv[0]=(char*)binary;
 for(int i=0;i<count;i++){strings[i]=(*env)->GetObjectArrayElement(env,arguments,i);argv[i+1]=(char*)(*env)->GetStringUTFChars(env,strings[i],NULL);if(!argv[i+1])goto cleanup;}
 if(pipe2(pipes,O_CLOEXEC)<0)goto cleanup;
 in=fcntl(input,F_DUPFD_CLOEXEC,10);if(in<0)goto cleanup;
 if(output>=0){out=fcntl(output,F_DUPFD_CLOEXEC,10);if(out<0)goto cleanup;}
 writer=fcntl(pipes[1],F_DUPFD_CLOEXEC,10);if(writer<0)goto cleanup;
 jclass sinkClass=(*env)->GetObjectClass(env,sink);jmethodID accept=(*env)->GetMethodID(env,sinkClass,"onBytes","([B)V");if(!accept)goto cleanup;
 pid_t pid=fork();
 if(pid<0)goto cleanup;
 if(pid==0){
  if(dup2(writer,1)<0||dup2(writer,2)<0||dup2(in,3)<0||(out>=0&&dup2(out,4)<0))_exit(126);
  close(writer);close(in);if(out>=0)close(out);
  execv(binary,argv);_exit(127);
 }
 atomic_store(&active_pid,pid);if(atomic_load(&cancelled))kill(pid,SIGTERM);
 close(pipes[1]);pipes[1]=-1;close(writer);writer=-1;
 char bytes[8192];ssize_t n;
 while((n=read(pipes[0],bytes,sizeof(bytes)))!=0){if(n<0){if(errno==EINTR)continue;break;}jbyteArray data=(*env)->NewByteArray(env,(jsize)n);if(!data){kill(pid,SIGTERM);break;}(*env)->SetByteArrayRegion(env,data,0,(jsize)n,(jbyte*)bytes);(*env)->CallVoidMethod(env,sink,accept,data);(*env)->DeleteLocalRef(env,data);if((*env)->ExceptionCheck(env)){kill(pid,SIGTERM);break;}}
 int status=0;while(waitpid(pid,&status,0)<0&&errno==EINTR){}
 atomic_store(&active_pid,0);result=WIFEXITED(status)?WEXITSTATUS(status):128+WTERMSIG(status);
cleanup:
 if(in>=0)close(in);if(out>=0)close(out);if(writer>=0)close(writer);if(pipes[0]>=0)close(pipes[0]);if(pipes[1]>=0)close(pipes[1]);
 if(strings&&argv)for(int i=0;i<count;i++){if(argv[i+1])(*env)->ReleaseStringUTFChars(env,strings[i],argv[i+1]);if(strings[i])(*env)->DeleteLocalRef(env,strings[i]);}
 free(strings);free(argv);if(binary)(*env)->ReleaseStringUTFChars(env,executable,binary);return result;
}
