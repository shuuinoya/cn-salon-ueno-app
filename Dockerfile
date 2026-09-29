# 本番ホスティング用（Render / Fly.io / Railway などのコンテナ実行）
# 依存パッケージゼロのNodeサーバーなので、ビルド工程はコピーのみ
FROM node:20-alpine
WORKDIR /app
COPY . .
ENV CLOUD=1 BIND=0.0.0.0
# 予約・設定・回数券などの保存先（各サービスの永続ディスクをここへマウントする）
ENV DEMO_DATA=/var/data/state.json
EXPOSE 10000
CMD ["node", "server.js"]
