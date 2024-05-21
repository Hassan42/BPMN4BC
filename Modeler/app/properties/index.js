import CustomPropertiesProvider from "./CustomPropertiesProvider";
import BcPropertiesProvider from "./BcPropertiesProvider";


export default {
  __init__: ["customPropertiesProvider", "bcPropertiesProvider"],
  customPropertiesProvider: ["type", CustomPropertiesProvider],
  bcPropertiesProvider: ["type", BcPropertiesProvider]
};
