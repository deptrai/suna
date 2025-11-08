const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const ESLintPlugin = require('eslint-webpack-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const webpack = require('webpack');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  const analyzeBundle = process.env.ANALYZE === 'true';

  return {
    // Entry points for extension components
    entry: {
      'content-script': './src/content-script/content-script.ts',
      'background': './src/background/background.ts',
      'popup': './src/popup/popup.tsx',
    },
    
    // Output configuration
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true, // Clean dist directory before each build
    },

    // Module resolution
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
      alias: {
        // Path alias to import from frontend (matches tsconfig.json)
        '@': path.resolve(__dirname, '../frontend/src'),
      },
    },

    // Module rules
    module: {
      rules: [
        // TypeScript/TSX files
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        // CSS files - extract for popup using MiniCssExtractPlugin
        {
          test: /popup\.css$/,
          use: [
            MiniCssExtractPlugin.loader,
            'css-loader',
            'postcss-loader',
          ],
        },
        // Other CSS files - use style-loader for runtime injection
        {
          test: /\.css$/,
          exclude: [/content-script\.css$/, /popup\.css$/],
          use: ['style-loader', 'css-loader', 'postcss-loader'],
        },
        // Content script CSS - extract to separate file
        {
          test: /content-script\.css$/,
          use: [
            {
              loader: 'file-loader',
              options: {
                name: '[name].css',
                outputPath: '.',
              },
            },
            'css-loader',
          ],
        },
      ],
    },

    // Plugins
    plugins: [
      // Define environment variables
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
      }),

      // Extract CSS for popup
      new MiniCssExtractPlugin({
        filename: '[name].css',
        chunkFilename: '[id].css',
      }),

      // HTML plugin for popup
      new HtmlWebpackPlugin({
        template: './src/popup/popup.html',
        filename: 'popup.html',
        chunks: ['popup'],
        inject: 'body',
      }),
      
      // Copy static assets (icons, manifest.json)
      new CopyWebpackPlugin({
        patterns: [
          {
            from: 'public/icons',
            to: 'icons',
          },
          {
            from: 'manifest.json',
            to: 'manifest.json',
          },
        ],
      }),

      // ESLint plugin - only run in development or when explicitly enabled
      new ESLintPlugin({
        extensions: ['ts', 'tsx', 'js', 'jsx'],
        exclude: ['node_modules', 'dist'],
        failOnError: isProduction, // Fail build on errors in production
        failOnWarning: false, // Don't fail on warnings
        emitWarning: true, // Emit warnings
        emitError: true, // Emit errors
        cache: true, // Enable caching for faster builds
        cacheLocation: path.resolve(__dirname, 'node_modules/.cache/.eslintcache'),
      }),

      // Bundle analyzer plugin - only when ANALYZE env var is set
      ...(analyzeBundle
        ? [
            new BundleAnalyzerPlugin({
              analyzerMode: 'server',
              openAnalyzer: true,
              reportFilename: 'bundle-report.html',
              generateStatsFile: true,
              statsFilename: 'bundle-stats.json',
            }),
          ]
        : []),
    ],

    // Development tools
    devtool: isProduction ? false : 'cheap-module-source-map',

    // Optimization
    optimization: {
      minimize: isProduction,
    },

    // Stats
    stats: {
      colors: true,
      modules: false,
      children: false,
      chunks: false,
      chunkModules: false,
    },

    // Progress plugin is built into webpack-cli, but we can configure it here
    // Progress is shown automatically by webpack-cli
    infrastructureLogging: {
      level: 'info',
    },
  };
};
