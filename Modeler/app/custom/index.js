import CustomPalette from './CustomPalette';
import CustomRenderer from './CustomRenderer';
import CustomRules from './CustomRules';
import CustomContextPadProvider from './CustomContextPadProvider';
import CustomReplaceMenuProvider from './CustomReplaceMenuProvider';
import DataObjectSync from './DataObjectSync';
import DataStoreSync from './DataStoreSync';
import GatewayDataSync from './GatewayDataSync';
import DataNameClashGuard from './DataNameClashGuard';

export default {
  __init__: [ 'customPalette', 'customRenderer', 'customRules', 'contextPadProvider', 'replaceMenuProvider', 'dataObjectSync', 'dataStoreSync', 'gatewayDataSync', 'dataNameClashGuard' ],
  customPalette: [ 'type', CustomPalette ],
  customRenderer: [ 'type', CustomRenderer ],
  customRules: [ 'type', CustomRules ],
  contextPadProvider: [ 'type', CustomContextPadProvider ],
  replaceMenuProvider: ['type', CustomReplaceMenuProvider],
  dataObjectSync: [ 'type', DataObjectSync ],
  dataStoreSync: [ 'type', DataStoreSync ],
  gatewayDataSync: [ 'type', GatewayDataSync ],
  dataNameClashGuard: [ 'type', DataNameClashGuard ]
};