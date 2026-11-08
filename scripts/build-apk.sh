#!/usr/bin/env bash
# 本机出 Android debug apk：工具链全在 D 盘（C 盘空间紧张），
# 并且要绕开 AGP 的一个硬限制 —— 它拒绝含非 ASCII 字符的项目路径。
#
# 做法：Windows 上如果项目路径含中文，就建一个 ASCII 的目录 junction
# （D:\evan-android -> 本仓库），在 junction 里构建；产物落在同一份物理目录里。
#
# 用法：bash scripts/build-apk.sh
set -euo pipefail

# Capacitor 8 的 capacitor.build.gradle 把 sourceCompatibility 定在 Java 21，JDK 17 会直接编译失败
export JAVA_HOME="${JAVA_HOME:-D:/tools/jdk21}"
export ANDROID_HOME="${ANDROID_HOME:-D:/Android/Sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-D:/gradle-home}"
export PATH="$JAVA_HOME/bin:$PATH"

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$PROJECT_DIR"

OS_NAME="$(uname -s)"
if [[ "$OS_NAME" == MINGW* || "$OS_NAME" == MSYS* ]]; then
  WIN_PATH="$(cd "$PROJECT_DIR" && pwd -W)"
  # 含非 ASCII 字符？（LC_ALL=C 下 grep 出 [^ -~] 即可）
  if printf '%s' "$WIN_PATH" | LC_ALL=C grep -q '[^ -~]'; then
    LINK_MSYS='/d/evan-android'
    if [[ ! -d "$LINK_MSYS" ]]; then
      # 必须用 PowerShell 建 junction：cmd 的 mklink 经过 MSYS 传参时目标会变成正斜杠，
      # 建出来的 junction 直接失效（表现成 ls 能看到、cd 却 No such file or directory）
      WIN_PATH_BS="$(printf '%s' "$WIN_PATH" | sed 's|/|\\\\|g')"
      powershell -NoProfile -Command "New-Item -ItemType Junction -Path 'D:\\evan-android' -Target '$WIN_PATH_BS' | Out-Null"
    fi
    if [[ ! -d "$LINK_MSYS" ]]; then
      echo "创建 junction 失败：D:\\evan-android -> $WIN_PATH" >&2
      exit 1
    fi
    BUILD_DIR="$LINK_MSYS"
    echo "== 非 ASCII 项目路径，改用 junction 构建：$BUILD_DIR =="
  fi
fi

echo "== java =="; "$JAVA_HOME/bin/java" -version 2>&1 | head -1
echo "== sdk =="; ls "$ANDROID_HOME" | tr '\n' ' '; echo

cd "$BUILD_DIR"
pnpm build
npx cap sync android

if [[ "$OS_NAME" == MINGW* || "$OS_NAME" == MSYS* ]]; then
  # 这个 MSYS2 没有 cygpath，./gradlew 跑不起来，只能走 gradlew.bat
  ( cd android && cmd //c gradlew.bat assembleDebug )
else
  ( cd android && ./gradlew assembleDebug )
fi

echo
echo 'APK: android/app/build/outputs/apk/debug/app-debug.apk'
ls -la android/app/build/outputs/apk/debug/