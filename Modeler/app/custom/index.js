import CustomPalette from './CustomPalette';
import CustomRenderer from './CustomRenderer';
import CustomRules from './CustomRules';
import CustomContextPadProvider from './CustomContextPadProvider';
import CustomReplaceMenuProvider from './CustomReplaceMenuProvider';
import DataObjectSync from './DataObjectSync';
import DataStoreSync from './DataStoreSync';

export default {
  __init__: [ 'customPalette', 'customRenderer', 'customRules', 'contextPadProvider', 'replaceMenuProvider', 'dataObjectSync', 'dataStoreSync' ],
  customPalette: [ 'type', CustomPalette ],
  customRenderer: [ 'type', CustomRenderer ],
  customRules: [ 'type', CustomRules ],
  contextPadProvider: [ 'type', CustomContextPadProvider ],
  replaceMenuProvider: ['type', CustomReplaceMenuProvider],
  dataObjectSync: [ 'type', DataObjectSync ],
  dataStoreSync: [ 'type', DataStoreSync ]
};