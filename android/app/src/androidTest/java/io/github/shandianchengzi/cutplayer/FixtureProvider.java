package io.github.shandianchengzi.cutplayer;
import android.database.*;
import android.os.*;
import android.provider.*;
import java.io.*;
public class FixtureProvider extends DocumentsProvider {
 public static final String AUTH="io.github.shandianchengzi.cutplayer.test.documents";
 private File root;
 @Override public boolean onCreate(){root=new File(getContext().getFilesDir(),"documents");return root.mkdirs()||root.isDirectory();}
 private File file(String id) throws FileNotFoundException {if("root".equals(id))return root;try{File f=new File(root,id);if(!f.getCanonicalPath().startsWith(root.getCanonicalPath()+"/"))throw new FileNotFoundException();return f;}catch(IOException e){throw new FileNotFoundException();}}
 private void entry(MatrixCursor c,File f,String id){MatrixCursor.RowBuilder row=c.newRow();for(String col:c.getColumnNames())row.add(col,switch(col){case DocumentsContract.Document.COLUMN_DOCUMENT_ID->id;case DocumentsContract.Document.COLUMN_DISPLAY_NAME->f.getName();case DocumentsContract.Document.COLUMN_MIME_TYPE->f.isDirectory()?DocumentsContract.Document.MIME_TYPE_DIR:"application/octet-stream";case DocumentsContract.Document.COLUMN_SIZE->f.length();case DocumentsContract.Document.COLUMN_FLAGS->f.isDirectory()?DocumentsContract.Document.FLAG_DIR_SUPPORTS_CREATE:DocumentsContract.Document.FLAG_SUPPORTS_WRITE|DocumentsContract.Document.FLAG_SUPPORTS_DELETE;default->null;});}
 private String[] cols(String[] projection){return projection!=null?projection:new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME,DocumentsContract.Document.COLUMN_MIME_TYPE,DocumentsContract.Document.COLUMN_SIZE,DocumentsContract.Document.COLUMN_FLAGS};}
 @Override public Cursor queryRoots(String[] projection){return new MatrixCursor(projection!=null?projection:new String[]{DocumentsContract.Root.COLUMN_ROOT_ID});}
 @Override public Cursor queryDocument(String id,String[] projection) throws FileNotFoundException {MatrixCursor c=new MatrixCursor(cols(projection));entry(c,file(id),id);return c;}
 @Override public Cursor queryChildDocuments(String id,String[] projection,String sort) throws FileNotFoundException {MatrixCursor c=new MatrixCursor(cols(projection));File[] files=file(id).listFiles();if(files!=null)for(File f:files)entry(c,f,f.getName());return c;}
 @Override public ParcelFileDescriptor openDocument(String id,String mode,CancellationSignal signal) throws FileNotFoundException {return ParcelFileDescriptor.open(file(id),ParcelFileDescriptor.parseMode(mode));}
 @Override public String createDocument(String parent,String mime,String name) throws FileNotFoundException {File f=file(name);try{if(!f.createNewFile())throw new IOException();return name;}catch(IOException e){throw new FileNotFoundException(name);}}
 @Override public boolean isChildDocument(String parent,String child){return "root".equals(parent)&&!"root".equals(child)&&!child.contains("/");}
 @Override public void deleteDocument(String id) throws FileNotFoundException {if(!file(id).delete())throw new FileNotFoundException(id);}
}
