FROM denoland/deno:2.9.6
WORKDIR /app
COPY deno.json deno.lock main.ts sdk.ts worker.ts ./
RUN deno cache --frozen main.ts worker.ts
LABEL org.opencontainers.image.title="MCP Static Hosting Functions" \
      org.opencontainers.image.source="https://github.com/reg2005/mcpStaticHosting" \
      org.opencontainers.image.licenses="MIT"
USER 1000:1000
EXPOSE 3003
CMD ["task", "start"]
