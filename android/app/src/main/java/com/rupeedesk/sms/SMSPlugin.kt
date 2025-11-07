package com.rupeedesk.sms

import android.Manifest
import android.content.pm.PackageManager
import android.content.Intent
import androidx.core.app.ActivityCompat
import com.getcapacitor.*
import org.json.JSONArray
import org.json.JSONObject

@CapacitorPlugin(name = "SMSSender")
class SMSPlugin : Plugin() {

    companion object {
        private const val REQUEST_SEND_SMS = 1001
    }

    private var pendingMessagesJson: String? = null
    private var pendingCall: PluginCall? = null

    /**
     * Main entry point called from JS:
     * Capacitor.Plugins.SMSSender.sendMessages({ messages: JSON.stringify([...]) })
     */
    @PluginMethod
    fun sendMessages(call: PluginCall) {
        val messages = call.getString("messages")

        if (messages.isNullOrBlank()) {
            call.reject("Missing messages array.")
            return
        }

        // Check permission
        if (ActivityCompat.checkSelfPermission(
                context,
                Manifest.permission.SEND_SMS
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            pendingMessagesJson = messages
            pendingCall = call
            pluginRequestPermission(Manifest.permission.SEND_SMS, REQUEST_SEND_SMS)
            return
        }

        // Permission OK → start service
        startSmsService(messages, call)
    }

    /**
     * Called automatically when permission dialog result is returned
     */
    override fun handleRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        if (requestCode == REQUEST_SEND_SMS) {
            val granted = grantResults.isNotEmpty() &&
                    grantResults[0] == PackageManager.PERMISSION_GRANTED
            if (granted && pendingMessagesJson != null && pendingCall != null) {
                startSmsService(pendingMessagesJson!!, pendingCall!!)
            } else {
                pendingCall?.reject("SMS permission denied.")
            }
            pendingMessagesJson = null
            pendingCall = null
        }
    }

    /**
     * Start the foreground service responsible for sending SMS.
     */
    private fun startSmsService(messagesJson: String, call: PluginCall) {
        val intent = Intent(context, SmsForegroundService::class.java)
        intent.putExtra("messages", messagesJson)
        context.startForegroundService(intent)

        // Service will send broadcast back once done
        val receiver = SmsResultReceiver { resultArray ->
            val resultObj = JSObject()
            resultObj.put("results", resultArray)
            call.resolve(resultObj)
            context.unregisterReceiver(it)
        }
        receiver.register(context)
    }
}