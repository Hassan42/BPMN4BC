import CustomPalette from './CustomPalette';
import CustomRenderer from './CustomRenderer';
import CustomRules from './CustomRules';
import CustomContextPadProvider from './CustomContextPadProvider';


export default {
  __init__: [ 'customPalette', 'customRenderer', 'customRules' ],
  // customContextPad: [ 'type', CustomContextPad ],
  customPalette: [ 'type', CustomPalette ],
  customRenderer: [ 'type', CustomRenderer ],
  customRules: [ 'type', CustomRules ],
  contextPadProvider: [ 'type', CustomContextPadProvider ],
};