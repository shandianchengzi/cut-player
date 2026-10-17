package io.github.shandianchengzi.cutplayer;
import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.provider.DocumentsContract;
/** Test APK only: grants a real cross-UID document tree permission to the app. */
public final class GrantActivity extends Activity {
 @Override public void onCreate(Bundle state){super.onCreate(state);grantUriPermission("io.github.shandianchengzi.cutplayer",DocumentsContract.buildTreeDocumentUri(FixtureProvider.AUTH,"root"),Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_PREFIX_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);finish();}
}
