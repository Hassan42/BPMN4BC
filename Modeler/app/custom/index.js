import CustomPalette from './CustomPalette';
import CustomRenderer from './CustomRenderer';
import CustomRules from './CustomRules';


export default {
  __init__: [ 'customPalette', 'customRenderer', 'customRules' ],
  // customContextPad: [ 'type', CustomContextPad ],
  customPalette: [ 'type', CustomPalette ],
  customRenderer: [ 'type', CustomRenderer ],
  customRules: [ 'type', CustomRules ]
};