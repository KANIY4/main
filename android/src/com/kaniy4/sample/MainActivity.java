package com.kaniy4.sample;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;

/**
 * Minimal sample screen: a tap counter plus the device/OS the app is running on.
 * Kept deliberately small so the whole APK builds from plain aapt2 + javac + d8.
 */
public class MainActivity extends Activity implements View.OnClickListener {

    private static final String COUNTER_KEY = "tap_count";

    private int tapCount;
    private TextView counterView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        if (savedInstanceState != null) {
            tapCount = savedInstanceState.getInt(COUNTER_KEY, 0);
        }

        counterView = findViewById(R.id.counter);
        renderCounter();

        Button tapButton = findViewById(R.id.tap_button);
        tapButton.setOnClickListener(this);

        TextView deviceInfo = findViewById(R.id.device_info);
        deviceInfo.setText(Build.MANUFACTURER + " " + Build.MODEL
                + "\nAndroid " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")");
    }

    @Override
    public void onClick(View view) {
        tapCount++;
        renderCounter();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        outState.putInt(COUNTER_KEY, tapCount);
    }

    private void renderCounter() {
        if (tapCount == 0) {
            counterView.setText(R.string.tap_count_zero);
            return;
        }
        counterView.setText(tapCount + (tapCount == 1 ? " tap" : " taps"));
    }
}
