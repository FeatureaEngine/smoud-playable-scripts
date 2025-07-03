const { merge } = require('webpack-merge');
const { webpackCommonConfig } = require('./webpack.common.js');
const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlInlineScriptPlugin = require('html-inline-script-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ExitAPIInjectorPlugin } = require('./plugins/ExitAPIInjectorPlugin.js');
const { DAPIInjectorPlugin } = require('./plugins/DAPIInjectorPlugin.js');
const { PangleInjectorPlugin } = require('./plugins/PangleInjectorPlugin.js');
const { MintegralInjectorPlugin } = require('./plugins/MintegralInjectorPlugin.js');
const { MRAIDInjectorPlugin } = require('./plugins/MRAIDInjectorPlugin.js');
const { ZipPlugin } = require('./plugins/ZipPlugin.js');
const path = require('path');
const { mergeOptions } = require('./utils/mergeOptions.js');
const { options } = require('./options.js');
const { buildDefines } = require('./utils/buildDefines.js');
const { buildTemplateString } = require('./utils/buildTemplateString.js');

/** @type {AD_NETWORK[]} */
const zipOutputNetworks = ['google', 'pangle', 'tiktok', 'vungle', 'mytarget', 'moloco', 'mintegral'];

/**
 * Creates webpack configuration for production build
 * @param {Partial<import('./index').CLIOptions>} [customOptions] - Custom options to merge with default options
 * @param {Record<string, any>} [customDefines] - Additional defines for webpack.DefinePlugin
 * @param {import('webpack').Configuration} [webpackCustomConfig] - Custom webpack config to merge
 * @returns {import('webpack').Configuration} Final webpack production configuration
 */
function makeWebpackBuildConfig(customOptions, customDefines, webpackCustomConfig) {
  const buildOptions = mergeOptions(options, customOptions);
  customDefines = customDefines || {};
  webpackCustomConfig = webpackCustomConfig || {};

  /** @type {AD_NETWORK} */
  const adNetwork = buildOptions['network'];

  /** @type {AD_PROTOCOL} */
  const adProtocol = buildOptions['protocol'];

  let outDir = buildTemplateString(buildOptions.outDir);

  function getFileName() {
    let filename = buildTemplateString(buildOptions.filename);

    if (adNetwork === 'mintegral') return filename.replace(/[^a-zA-Z0-9]/g, '_').replace('_fullhash_6_', '[fullhash:6]');
    return filename;
  }

  let htmlFileName = '';
  if (adNetwork === 'mintegral') htmlFileName = `${buildOptions.name}.html`;
  else if (zipOutputNetworks.includes(adNetwork)) htmlFileName = 'index.html';
  else htmlFileName = `${getFileName()}.html`;

  const metaTags = {
    viewport: 'width=device-width,initial-scale=1.0,viewport-fit=cover,maximum-scale=1.0,user-scalable=no'
  };

  if (adNetwork === 'mintegral') {
    metaTags['viewport'] = 'width=device-width,user-scalable=no,initial-scale=1.0,minimum-scale=1.0,maximum-scale=1.0';
  }

  if (!buildOptions.skipRecommendedMeta) {
    metaTags['HandheldFriendly'] = 'True';
    metaTags['cleartype'] = { 'http-equiv': 'cleartype', content: 'on' };
    metaTags['apple-mobile-web-app-capable'] = 'yes';
    metaTags['mobile-web-app-capable'] = 'yes';
    metaTags['X-UA-Compatible'] = { 'http-equiv': 'X-UA-Compatible', content: 'IE=10' };
  }

  const webpackConfig = merge(
    webpackCommonConfig,
    {
      mode: 'production',
      stats: 'errors-only',
      optimization: {
        usedExports: true,
        minimize: true,
        minimizer: [
          new TerserPlugin({
            extractComments: false,
            terserOptions: {
              safari10: true,
              mangle: {
                reserved: ['$']
              },
              compress: {
                drop_console: true,
                arrows: false
              },
              output: {
                comments: false,
                quote_style: 3
              }
            }
          })
        ]
      },
      plugins: [
        new HtmlWebpackPlugin({
          template: path.resolve('src/index.html'),
          filename: htmlFileName,
          title: `${buildOptions.name} - ${buildOptions.app}`,
          inlineSource: '.(js|css|png|jpg|svg|mp3|gif|glb|fbx|obj)$',
          meta: metaTags
        }),

        new webpack.DefinePlugin({
          ...buildDefines(),
          ...buildOptions.defines,
          ...customDefines
        }),

        // For some reason needed for PIXI v8
        new webpack.optimize.LimitChunkCountPlugin({
          maxChunks: 1
        })
      ]
    },
    webpackCustomConfig
  );

  webpackConfig.output.path = path.resolve(outDir);

  if (adNetwork !== 'mintegral') webpackConfig.plugins.push(new HtmlInlineScriptPlugin());

  if ('dapi' === adProtocol) {
    webpackConfig.plugins.push(new DAPIInjectorPlugin());
  } else if ('mraid' === adProtocol) {
    if (adNetwork === 'ironsource') {
      webpackConfig.plugins.push(new MRAIDInjectorPlugin());
    }
  }

  if (zipOutputNetworks.includes(adNetwork)) {
    if (adNetwork === 'google') {
      webpackConfig.plugins.push(new ExitAPIInjectorPlugin());
    } else if (adNetwork === 'pangle') {
      webpackConfig.plugins.push(new PangleInjectorPlugin());
    } else if (adNetwork === 'mintegral') {
      webpackConfig.plugins.push(new MintegralInjectorPlugin());
    } else if (adNetwork === 'tiktok') {
      webpackConfig.plugins.push(
        new CopyWebpackPlugin({
          patterns: [{ from: path.join(__dirname, 'resources', 'tiktok-config.json'), to: 'config.json' }]
        })
      );
    }

    webpackConfig.plugins.push(
      new ZipPlugin({
        filename: getFileName(),
        path: path.resolve(outDir)
      })
    );

    webpackConfig.output.path = path.resolve(outDir, adNetwork);
  }

  return webpackConfig;
}

/**
 * Runs webpack production build
 * @param {import('webpack').Configuration} [webpackConfig] - Webpack configuration to use, creates default if not provided
 * @param {Partial<import('./index').CLIOptions>} [customOptions] - Custom options to merge with default options
 * @param {Record<string, any>} [customDefines] - Additional defines for webpack.DefinePlugin
 * @param {import('webpack').Configuration} [webpackCustomConfig] - Custom webpack config to merge
 */
function runBuild(webpackConfig, customOptions, customDefines, webpackCustomConfig) {
  if (!webpackConfig) webpackConfig = makeWebpackBuildConfig(customOptions, customDefines, webpackCustomConfig);

  const compiler = webpack(webpackConfig);
  compiler.run((err, stats) => {
    if (err) {
      console.error('Build failed:', err.stack || err);
      if (err.details) {
        console.error('Error details:', err.details);
      }
      return;
    }

    if (stats.hasErrors()) {
      console.log(stats.compilation.errors);
      console.error(`Build finished with errors.`);
    } else {
      console.log(`Build successful!`);
    }
  });
}

exports.makeWebpackBuildConfig = makeWebpackBuildConfig;
exports.runBuild = runBuild;
