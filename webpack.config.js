const path = require('path')
const webpack = require('webpack')

module.exports = {
  entry: './extensions/kiwixAPI.js',
  output: {
    filename: 'toc.js',
    path: path.resolve(__dirname, './res/')
  },
  module: {
		rules: [{
			test: /\.js$/,
			exclude: /node_modules/,
			use: {
				loader: 'babel-loader',
			}
		}]
  },
  plugins: [
    new webpack.ProvidePlugin({
      '$': 'jquery',
      'jQuery': 'jquery',
      'window.jQuery': 'jquery'
    })
  ],
}
