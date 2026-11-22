const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    app: './app/app.js',
    'execution-panel': './app/scripts/execution-panel.js',
    'diagram-viewer': './app/scripts/diagram-viewer.js',
    'models': './app/scripts/models.js',
    'model-detail': './app/scripts/model-detail.js'
  },
  output: {
    path: path.resolve(__dirname, 'public'),
    filename: '[name].js'                        // Will output: public/app.js and public/execution-panel.js
  },
  module: {
    rules: [
      {
        test: /\.bpmn$/,
        use: 'raw-loader'
      },
      {
        test: /\.(svg)$/i,
        type: 'asset/inline'
      },
      {
        test: /\.js$/,
        exclude: /node_modules/,
        type: 'javascript/auto'
      }
    ]
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: 'assets/**', to: 'vendor/bpmn-js', context: 'node_modules/bpmn-js/dist/' },
        { from: 'dist/assets/properties-panel.css', to: 'vendor/properties-panel/properties-panel.css', context: 'node_modules/@bpmn-io/properties-panel/' },
        { from: '**/*.{html,css}', context: 'app/' }  // Ensure HTML/CSS files are copied
      ]
    })
  ],
  resolve: {
    fallback: {
      fs: false,
      path: false,
      os: false,
      crypto: false,
    }
  },
  mode: 'development',
  devtool: 'source-map',
  devServer: {
    static: {
      directory: path.join(__dirname, 'public'),
    },
    compress: true,
    port: 5000,
    headers: {
      'Content-Type': 'application/javascript'
    }
  }
};
