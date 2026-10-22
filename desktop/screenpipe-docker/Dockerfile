FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y curl ca-certificates libopenblas0 libpipewire-0.3-0 libxcb1 libxrandr2 libxss1 libxtst6 libx11-6 libxcomposite1 libxdamage1 libxfixes3 libasound2t64 libdbus-1-3 libgtk-3-0 libgbm1 libdrm2 libxkbcommon0 libwayland-client0 libwayland-egl1 libegl1 libgl1 libglib2.0-0 libnss3 libxcursor1 libxi6 libxinerama1 libpango-1.0-0 libcairo2 libayatana-appindicator3-1 libwebkit2gtk-4.1-0 tesseract-ocr tesseract-ocr-fra xdotool && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*
RUN npm install -g screenpipe@latest && (screenpipe --version || true)
ENTRYPOINT ["screenpipe"]
