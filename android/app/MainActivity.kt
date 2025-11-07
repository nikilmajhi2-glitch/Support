package com.rupeedesk.app

import android.Manifest
import android.os.Bundle
import androidx.core.app.ActivityCompat
import com.getcapacitor.BridgeActivity
import com.rupeedesk.sms.SMSPlugin   // 👈 Import your custom plugin

class MainActivity : BridgeActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // ✅ Ask for SEND_SMS permission when the app launches
        ActivityCompat.requestPermissions(
            this,
            arrayOf(Manifest.permission.SEND_SMS),
            1001
        )
    }

    override fun onStart() {
        super.onStart()
        // ✅ Register SMS plugin so Capacitor bridge detects it
        bridge?.pluginManager?.add(SMSPlugin::class.java.name, SMSPlugin::class.java)
    }
}