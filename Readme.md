# BPMN4BC

A modeling and execution environment for **blockchain-based business processes**. Processes are
modeled in BPMN with blockchain extensions (on-chain pools and tasks, permissioned and
permissionless participants, payable tasks, block timers, multi-instance and shared pools,
data stores), compiled to upgradeable Solidity contracts, deployed to local test chains and
executed step by step from the browser.

## Publication

Hassan Atwi and Cesare Pautasso. **BPMN4BC: A Simple BPMN Extension for Blockchain-Enabled Business Process Modeling.**
In *Service-Oriented Computing – ICSOC 2025*, Lecture Notes in Computer Science, pp. 306–320. Springer, 2026.
[doi:10.1007/978-981-95-5015-9_22](https://link.springer.com/chapter/10.1007/978-981-95-5015-9_22)

```bibtex
@inproceedings{atwi2026bpmn4bc,
  title     = {BPMN4BC: A Simple BPMN Extension for Blockchain-Enabled Business Process Modeling},
  author    = {Atwi, Hassan and Pautasso, Cesare},
  booktitle = {Service-Oriented Computing: 23rd International Conference, ICSOC 2025, Shenzhen, China, December 1--4, 2025, Proceedings, Part II},
  series    = {Lecture Notes in Computer Science},
  pages     = {306--320},
  year      = {2026},
  publisher = {Springer Nature Singapore},
  doi       = {10.1007/978-981-95-5015-9_22}
}
```

## Architecture

| Service | Folder | What it does |
|---|---|---|
| Modeler | `Modeler/` | bpmn-js web app (modeling, validation, deployment, execution panel) and the API gateway |
| Compiler | `Compiler/` | BPMN XML → Solidity (ERC-7201 storage, UUPS proxies, role checks, timers) |
| Deployment | `Deployement/` | Hardhat project: compiles, deploys and runs the generated contracts; stores models and instances |
| Chains | `Ganache/` | Two local ganache chains (`network-1`, `network-2`) with 1-second blocks |

The browser talks only to the Modeler; the Modeler relays to the Compiler and Deployment
services, and the Deployment service talks to the chains.

## Run locally

Requirement: [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running).

```bash
./run.sh
```

This builds and starts all five services and prints the address (http://localhost:5000).
The first build takes a few minutes; later starts take seconds.

| Command | What it does |
|---|---|
| `./run.sh` | build (if needed) and start everything |
| `./run.sh stop` | stop all containers (saved models are kept) |
| `./run.sh logs` | follow the logs of all services |
| `./run.sh status` | list the containers |
| `./run.sh reset` | delete containers and all saved models/instances |

Use another port with `MODELER_PORT=8080 ./run.sh`. Without the script: `docker compose up -d --build`.

<details>
<summary>Running the services without Docker (for development)</summary>

Requires Node.js 20; the chains still run in Docker.

```bash
docker build -t bpmn4bc-ganache ./Ganache
docker run -d --name network-1 -p 8545:8545 -e PORT=8545 bpmn4bc-ganache
docker run -d --name network-2 -p 8546:8546 -e PORT=8546 bpmn4bc-ganache

cd Compiler && npm install && PORT=8000 npm start
cd Deployement && npm install && PORT=3000 COM_API_BASE_URL=http://localhost:8000 \
  NETWORK_1_URL=http://127.0.0.1:8545 NETWORK_2_URL=http://127.0.0.1:8546 npm start
cd Modeler && npm install && npm run build && PORT=5000 node server.js
```
</details>
