# BPMN4BC

A modeling and execution environment for **blockchain-based business processes**. Processes are
modeled in BPMN with blockchain extensions (on-chain pools and tasks, permissioned and
permissionless participants, payable tasks, block timers, multi-instance and shared pools,
data stores), compiled to upgradeable Solidity contracts, deployed to local test chains and
executed step by step from the browser.

## Architecture

| Service | Folder | What it does |
|---|---|---|
| Modeler | `Modeler/` | bpmn-js web app (modeling, validation, deployment, execution panel) and the API gateway |
| Compiler | `Compiler/` | BPMN XML → Solidity (ERC-7201 storage, UUPS proxies, role checks, timers) |
| Deployment | `Deployement/` | Hardhat project: compiles, deploys and runs the generated contracts; stores models and instances |
| Chains | `Ganache/` | Two local ganache chains (`network-1`, `network-2`) with 1-second blocks |

The browser talks only to the Modeler; the Modeler relays to the Compiler and Deployment
services, and the Deployment service talks to the chains.

There are no accounts: each browser gets a random id (kept in localStorage) and sees only the
models and instances it created.

## Run locally

Requirements: Node.js 20, Docker (for the chains).

```bash
# chains
docker build -t bpmn4bc-ganache ./Ganache
docker run -d --name network-1 -p 8545:8545 -e PORT=8545 bpmn4bc-ganache
docker run -d --name network-2 -p 8546:8546 -e PORT=8546 bpmn4bc-ganache

# services (one terminal each)
cd Compiler && npm install && PORT=8000 npm start
cd Deployement && npm install && PORT=3000 COM_API_BASE_URL=http://localhost:8000 \
  NETWORK_1_URL=http://127.0.0.1:8545 NETWORK_2_URL=http://127.0.0.1:8546 npm start
cd Modeler && npm install && npm run build && PORT=5000 node server.js
```

Then open http://localhost:5000.

## Hosting

See [RAILWAY.md](RAILWAY.md) for deploying all services on Railway.

## Postman

`Postman/` contains example API collections for the Deployment service.
