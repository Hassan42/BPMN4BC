# Local test chain for BPMN4BC (one Railway service per network: network-1, network-2).
# Pinned version; the chain is kept in memory, so it starts empty after every restart
# (the deployment service notices this and drops instances deployed on the old chain).
FROM trufflesuite/ganache:v7.9.2

# PORT: 8545 for network-1, 8546 for network-2 (must match NETWORK_x_URL in the deployment service)
ENV PORT=8545
# "::" listens on IPv6 and IPv4 (Railway private networking); set HOST=0.0.0.0 to force IPv4
ENV HOST=::

EXPOSE 8545
# 1-second blocks so block timers advance even when nobody sends transactions
ENTRYPOINT ["/bin/sh", "-c", "exec node /app/dist/node/cli.js --server.host \"$HOST\" --server.port \"$PORT\" --miner.blockTime 1"]
