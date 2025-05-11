import CustomPalette from './CustomPalette';
import CustomRenderer from './CustomRenderer';
import CustomRules from './CustomRules';
import CustomContextPadProvider from './CustomContextPadProvider';
import CustomReplaceMenuProvider from './CustomReplaceMenuProvider';

export default {
  __init__: [ 'customPalette', 'customRenderer', 'customRules', 'contextPadProvider', 'replaceMenuProvider' ],
  // customContextPad: [ 'type', CustomContextPad ],
  customPalette: [ 'type', CustomPalette ],
  customRenderer: [ 'type', CustomRenderer ],
  customRules: [ 'type', CustomRules ],
  contextPadProvider: [ 'type', CustomContextPadProvider ],
  replaceMenuProvider: ['type', CustomReplaceMenuProvider]
};