Rupeedesk - GitHub-ready project (Capacitor + Web)

This repository is prepared so you can push it to GitHub and use GitHub Actions to build a debug APK.

Files included:
- www/                 -> web app files (index.html, script.js, style.css, etc.)
- package.json         -> minimal npm config
- capacitor.config.json -> Capacitor config (appId: com.rupeedesk.app)
- .github/workflows/android.yml -> GitHub Actions to add android, sync and build debug APK
- android_plugin/      -> Kotlin plugin skeleton (copy into android app if needed)

Usage:
1. Push this repo to GitHub (create new repo and push).
2. On GitHub, go to Actions -> Build Android APK -> Run workflow (or push to main).
3. After the workflow finishes, download the artifact 'Rupeedesk-APK' containing the debug APK.

Notes:
- The workflow uses android-actions/setup-android to install Android SDK command-line tools.
- The workflow runs 'npx cap add android' if the android project is missing; that requires the Android SDK present (the action installs it).
- You may need to customize `android_plugin` Kotlin files into the generated Android project for native SMS functionality.
- Testing must be done on a real Android device to verify SMS sending behavior.
