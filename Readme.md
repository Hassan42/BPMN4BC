# Project Overview

This repository contains three separate services, each located in its own directory:

1. **Modeler** - Responsible for creating and managing process models.
2. **Deployment** - Handles the deployment of models and related resources.
3. **Compiler** - Compiles the models into executable formats.

This project requires the **trufflesuite/ganache** Docker image to emulate a local blockchain environment.

---

## Setup and Running Instructions

### Prerequisites
- **Node.js** (version 14.x or above)
- **npm** (Node Package Manager)
- **Docker** (for the Ganache image)

### Steps to Set Up and Run

1. Pull the required Docker image for Ganache:
   ```bash
   docker pull trufflesuite/ganache
   ```

2. Navigate to the desired service directory (`Modeler`, `Deployment`, or `Compiler`).

3. Install the dependencies:
   ```bash
   npm install
   ```

4. Start the service:
   ```bash
   npm start
   ```

---

## Services Details

### **Modeler**
- **Path**: `./Modeler`
- **Notes**: You can use the webapp to compile, deploy your process diagrams.

### **Deployment**
- **Path**: `./Deployment`
- **Notes**: To start the network use the postman api ./Postman/BPMN4BC.postman_collection.json. (Make sure docker is running)

### **Compiler**
- **Path**: `./Compiler`
- **Notes**: You will find the compiled solidity contracts in the directory ./Compiler/output.

---