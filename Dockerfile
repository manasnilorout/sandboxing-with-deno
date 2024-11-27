# Dockerfile
FROM denoland/deno:latest

WORKDIR /usr/src/app

# Cache dependencies
# COPY deps.ts .
# RUN deno cache deps.ts

# Copy source code
COPY . .

# Compile and allow network access
RUN deno cache server.ts

# Port configuration
EXPOSE 8000

# Run with necessary permissions
CMD ["deno", "run", "server"]