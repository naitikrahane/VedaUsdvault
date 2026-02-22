require("@nomicfoundation/hardhat-toolbox");
const { subtask } = require("hardhat/config");
const {
  TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD
} = require("hardhat/builtin-tasks/task-names");
const solc = require("solc");

subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(
  async ({ solcVersion }) => {
    const localLongVersion = solc.version();
    const localVersion = localLongVersion.split("+")[0];

    if (localVersion !== solcVersion) {
      throw new Error(
        `Configured solc version ${solcVersion} does not match local solcjs ${localLongVersion}.`
      );
    }

    return {
      compilerPath: require.resolve("solc/soljson.js"),
      isSolcJs: true,
      version: localVersion,
      longVersion: localLongVersion
    };
  }
);

module.exports = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test"
  }
};
