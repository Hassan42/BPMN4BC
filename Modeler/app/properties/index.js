import CustomPropertiesProvider from "./CustomPropertiesProvider";
import BcPropertiesProvider from "./BcPropertiesProvider";


export default {
  __init__: ["bcPropertiesProvider"],
  bcPropertiesProvider: ["type", BcPropertiesProvider]
};
