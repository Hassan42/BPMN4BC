import BcPropertiesProvider from "./BcPropertiesProvider";
import CustomPropertiesProvider from "./CustomPropertiesProvider";

export default {
  __init__: ["bcPropertiesProvider", "customPropertiesProvider"],
  customPropertiesProvider: ["type", CustomPropertiesProvider],
  bcPropertiesProvider: ["type", BcPropertiesProvider],
};
