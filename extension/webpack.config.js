const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
  entry: {
    'content-script': './src/content-script/content-script.ts',
    'background': './src/background/background.ts',
    'sidepanel': './src/sidepanel/sidepanel.tsx',
  },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true,
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: [
            /node_modules/,
            /__tests__/,
            /\.test\.ts$/,
            /\.spec\.ts$/,
            /\.integration\.test\.ts$/,
          ],
        },
        {
          // CSS rule for content-script: extract to separate file
          test: /\.css$/,
          include: path.resolve(__dirname, 'src/content-script'),
          use: [
            MiniCssExtractPlugin.loader,
            'css-loader',
            {
              loader: 'postcss-loader',
              options: {
                postcssOptions: {
                  plugins: [
                    require('@tailwindcss/postcss'),
                    require('autoprefixer'),
                  ],
                },
              },
            },
          ],
        },
        {
          // CSS rule for sidepanel: inject styles (React app)
          test: /\.css$/,
          exclude: path.resolve(__dirname, 'src/content-script'),
          use: [
            'style-loader',
            'css-loader',
            {
              loader: 'postcss-loader',
              options: {
                postcssOptions: {
                  plugins: [
                    require('@tailwindcss/postcss'),
                    require('autoprefixer'),
                  ],
                },
              },
            },
          ],
        },
      ],
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      alias: {
        '@': path.resolve(__dirname, '../frontend/src'),
      },
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './src/sidepanel/sidepanel.html',
        filename: 'sidepanel.html',
        chunks: ['sidepanel'],
        inject: 'body',
      }),
      new MiniCssExtractPlugin({
        filename: 'content-script.css',
        chunkFilename: '[id].css',
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: 'manifest.json', to: '.' },
          { from: 'public/icons', to: 'icons' },
        ],
      }),
    ],
    devtool: isProduction ? false : 'source-map',
    optimization: {
      minimize: isProduction,
    },
  };
};

