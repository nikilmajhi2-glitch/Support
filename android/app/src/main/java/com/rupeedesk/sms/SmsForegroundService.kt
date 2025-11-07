package com.rupeedesk.sms

import android.app.*
import android.content.*
import android.os.*
import android.telephony.SmsManager
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class SmsForegroundService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val messagesJson = intent?.getStringExtra("messages") ?: "[]"
        val messages = JSONArray(messagesJson)

        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channelId = "sms_send_channel"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "SMS Sending",
                NotificationManager.IMPORTANCE_LOW
            )
            nm.createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle("Rupeedesk SMS Sender")
            .setContentText("Sending messages...")
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .build()

        startForeground(1001, notification)

        val results = JSONArray()
        val latch = CountDownLatch(messages.length())

        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                val msgId = intent?.getStringExtra("msgId") ?: return
                val result = JSONObject()
                result.put("id", msgId)
                result.put("success", resultCode == Activity.RESULT_OK)
                if (resultCode != Activity.RESULT_OK) {
                    result.put("error", "Generic failure: code $resultCode")
                }
                results.put(result)
                latch.countDown()
            }
        }

        val action = "SMS_SENT_ACTION_${System.currentTimeMillis()}"
        registerReceiver(receiver, IntentFilter(action))

        val smsManager = SmsManager.getDefault()
        for (i in 0 until messages.length()) {
            val obj = messages.getJSONObject(i)
            val id = obj.optString("id", "msg$i")
            val to = obj.optString("to")
            val body = obj.optString("body")

            val sentIntent = Intent(action)
            sentIntent.putExtra("msgId", id)
            val pi = PendingIntent.getBroadcast(
                this, id.hashCode(), sentIntent,
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
                else
                    PendingIntent.FLAG_UPDATE_CURRENT
            )
            try {
                smsManager.sendTextMessage(to, null, body, pi, null)
            } catch (e: Exception) {
                val result = JSONObject()
                result.put("id", id)
                result.put("success", false)
                result.put("error", e.message ?: "sendTextMessage() failed")
                results.put(result)
                latch.countDown()
            }
        }

        // Wait for results or timeout
        Thread {
            latch.await(60, TimeUnit.SECONDS)
            val resIntent = Intent("SMS_SEND_RESULTS")
            resIntent.putExtra("results", results.toString())
            sendBroadcast(resIntent)
            stopForeground(true)
            stopSelf()
        }.start()

        return START_NOT_STICKY
    }
}