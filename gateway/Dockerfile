# 002-accounts-credits / M-A2：平台 credit 代理镜像。
# proxy.py 纯 stdlib，无需装任何依赖。
# 密钥（SUPABASE_*/DEEPSEEK_API_KEY）一律运行时注入（Fly secrets / Railway vars），
# 绝不烤进镜像、绝不入库。
FROM python:3.12-slim

WORKDIR /app
COPY credit_math.py proxy.py ./

# 容器内对外监听。PORT 由平台注入（Fly/Railway 习惯用 8080）。
ENV PROXY_HOST=0.0.0.0 \
    PROXY_PORT=8080
EXPOSE 8080

CMD ["python3", "proxy.py"]
