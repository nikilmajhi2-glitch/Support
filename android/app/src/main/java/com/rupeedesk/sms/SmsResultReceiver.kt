package com.rupeedesk.sms

import android.content.*
import org.json.JSONArray

class SmsResultReceiver(private val onComplete: (JSONArray) -> Unit) {
    private lateinit var receiver: BroadcastReceiver

    fun register(context: Context) {
        receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                val json = intent?.getStringExtra("results") ?: "[]"
                val arr = JSONArray(json)
                onComplete(arr)
            }
        }
        context.registerReceiver(receiver, IntentFilter("SMS_SEND_RESULTS"))
    }

    operator fun invoke(action: (JSONArray) -> Unit): BroadcastReceiver {
        return receiver
    }
}