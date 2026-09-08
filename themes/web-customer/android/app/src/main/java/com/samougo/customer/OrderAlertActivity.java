package com.samougo.customer;

import android.app.KeyguardManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

/** Native alarm UI: requires no WebView, network fetch or active JS process. */
public class OrderAlertActivity extends AppCompatActivity {
    public static final String ACTION_CLOSED = "com.samougo.customer.ORDER_ALERT_CLOSED";
    private String orderId;
    private final BroadcastReceiver closed = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) { finish(); }
    };

    public static PendingIntent pendingIntent(Context context, String orderId, String title, String body) {
        Intent intent = new Intent(context, OrderAlertActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra("orderId", orderId).putExtra("title", title).putExtra("body", body);
        return PendingIntent.getActivity(context, orderId.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        ContextCompat.registerReceiver(this, closed, new IntentFilter(ACTION_CLOSED), ContextCompat.RECEIVER_NOT_EXPORTED);
        render();
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        render();
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private TextView text(String value, int size, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setIncludeFontPadding(false);
        view.setTextColor(getColor(R.color.order_alert_ink));
        view.setGravity(Gravity.CENTER);
        view.setPadding(dp(4), dp(4), dp(4), dp(4));
        view.setTypeface(androidx.core.content.res.ResourcesCompat.getFont(this, R.font.cairo), bold ? Typeface.BOLD : Typeface.NORMAL);
        return view;
    }
    private String extra(String key, String fallback) {
        String value = getIntent().getStringExtra(key);
        return value == null || value.trim().isEmpty() ? fallback : value;
    }
    private void render() {
        orderId = getIntent().getStringExtra("orderId");
        if (orderId == null || orderId.trim().isEmpty()) { finish(); return; }
        boolean compact = getResources().getConfiguration().screenHeightDp < 720;
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(getColor(R.color.order_alert_surface));
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER_HORIZONTAL);
        layout.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        layout.setPadding(dp(24), dp(compact ? 12 : 20), dp(24), dp(16));
        scroll.addView(layout, new ScrollView.LayoutParams(-1, -1));

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        TextView brand = text("سموع كويك", 17, true);
        brand.setGravity(Gravity.START);
        header.addView(brand, new LinearLayout.LayoutParams(0, -2, 1));
        TextView status = text("●  طلب وارد", 12, true);
        status.setTextColor(getColor(R.color.order_alert_deep));
        status.setPadding(dp(12), dp(4), dp(12), dp(4));
        status.setBackground(surface(R.color.order_alert_tint, 24));
        header.addView(status);
        layout.addView(header, new LinearLayout.LayoutParams(-1, -2));
        spacer(layout, compact ? 8 : 20, 1);

        android.widget.ImageView icon = new android.widget.ImageView(this);
        icon.setImageResource(R.drawable.ic_order_alert_outline);
        icon.setColorFilter(getColor(R.color.order_alert_brand));
        int iconPadding = dp(compact ? 18 : 27);
        icon.setPadding(iconPadding, iconPadding, iconPadding, iconPadding);
        icon.setBackground(surface(R.color.order_alert_tint, 40));
        icon.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        layout.addView(icon, new LinearLayout.LayoutParams(dp(compact ? 72 : 104), dp(compact ? 72 : 104)));
        spacer(layout, compact ? 8 : 16, 0);
        String title = extra("title", "لديك طلب جديد").replace("🛒", "").replace("🚨", "").trim();
        TextView heading = text(title, compact ? 23 : 27, true);
        androidx.core.view.ViewCompat.setAccessibilityHeading(heading, true);
        layout.addView(heading);
        TextView subtitle = text("طلبك التالي بانتظارك", 14, false);
        subtitle.setTextColor(getColor(R.color.order_alert_muted));
        layout.addView(subtitle);
        spacer(layout, compact ? 12 : 24, 0);

        LinearLayout details = new LinearLayout(this);
        details.setOrientation(LinearLayout.VERTICAL);
        details.setPadding(dp(20), dp(16), dp(20), dp(16));
        GradientDrawable card = surface(R.color.order_alert_white, 24);
        card.setStroke(dp(1), getColor(R.color.order_alert_line));
        details.setBackground(card);
        TextView label = text("تفاصيل الطلب", 12, true);
        label.setTextColor(getColor(R.color.order_alert_muted));
        label.setGravity(Gravity.START);
        details.addView(label);
        String[] lines = extra("body", "افتح الطلب لمراجعة التفاصيل وتأكيد القبول.").split("\\n");
        for (int i = 0; i < lines.length; i++) {
            if (lines[i].trim().isEmpty()) continue;
            TextView detail = text(lines[i], i == 0 ? 18 : 14, i == 0);
            detail.setGravity(Gravity.START);
            detail.setTextDirection(View.TEXT_DIRECTION_FIRST_STRONG_RTL);
            detail.setTextColor(getColor(i == 0 ? R.color.order_alert_ink : R.color.order_alert_muted));
            details.addView(detail);
        }
        layout.addView(details, new LinearLayout.LayoutParams(-1, -2));
        spacer(layout, compact ? 12 : 24, 1);
        Button open = button("عرض تفاصيل الطلب", true);
        open.setOnClickListener(v -> openOrder());
        layout.addView(open);
        Button mute = button("كتم التنبيه", false);
        mute.setOnClickListener(v -> { acknowledge(); finish(); });
        layout.addView(mute);
        TextView note = text("كتم التنبيه لا يرفض الطلب", 11, false);
        note.setTextColor(getColor(R.color.order_alert_muted));
        layout.addView(note);
        if (Build.VERSION.SDK_INT >= 34 && !getSystemService(NotificationManager.class).canUseFullScreenIntent()) {
            Button permission = button("السماح بالتنبيه على شاشة القفل", false);
            permission.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                Uri.parse("package:" + getPackageName()))));
            layout.addView(permission);
        }
        setContentView(scroll);
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(scroll, (view, insets) -> {
            androidx.core.graphics.Insets bars = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return insets;
        });
    }
    private GradientDrawable surface(int color, int radius) {
        GradientDrawable background = new GradientDrawable();
        background.setColor(getColor(color));
        background.setCornerRadius(dp(radius));
        return background;
    }
    private void spacer(LinearLayout layout, int height, int weight) {
        layout.addView(new View(this), new LinearLayout.LayoutParams(1, dp(height), weight));
    }
    private Button button(String title, boolean primary) {
        Button button = new Button(this);
        button.setText(title);
        button.setTextSize(16);
        button.setIncludeFontPadding(false);
        button.setTypeface(androidx.core.content.res.ResourcesCompat.getFont(this, R.font.cairo), Typeface.BOLD);
        button.setAllCaps(false);
        button.setMinHeight(dp(56));
        button.setPadding(dp(12), dp(10), dp(12), dp(10));
        button.setTextColor(getColor(primary ? R.color.order_alert_white : R.color.order_alert_muted));
        GradientDrawable background = surface(primary ? R.color.order_alert_brand : R.color.order_alert_white, 18);
        if (!primary) background.setStroke(dp(1), getColor(R.color.order_alert_line));
        button.setBackground(new android.graphics.drawable.RippleDrawable(
            android.content.res.ColorStateList.valueOf(getColor(R.color.order_alert_tint)), background, null));
        button.setStateListAnimator(null);
        button.setElevation(primary ? dp(2) : 0);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.setMargins(0, dp(8), 0, 0);
        button.setLayoutParams(params);
        return button;
    }
    private void acknowledge() {
        OrderAlarmReceiver.stopAlarm(this);
        getSystemService(NotificationManager.class).cancel(orderId.hashCode());
    }
    private void openOrder() {
        Runnable open = () -> {
            Intent intent = new Intent(this, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP)
                .putExtra("orderId", orderId).putExtra("google.message_id", "alert-" + orderId);
            startActivity(intent);
            acknowledge();
            finish();
        };
        KeyguardManager keyguard = getSystemService(KeyguardManager.class);
        if (Build.VERSION.SDK_INT >= 26 && keyguard.isKeyguardLocked()) {
            keyguard.requestDismissKeyguard(this, new KeyguardManager.KeyguardDismissCallback() {
                @Override public void onDismissSucceeded() { open.run(); }
            });
        } else { open.run(); }
    }
    @Override protected void onDestroy() {
        unregisterReceiver(closed);
        super.onDestroy();
    }
}
