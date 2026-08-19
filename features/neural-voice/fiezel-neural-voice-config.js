(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.FiezelNeuralVoiceConfig = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const config = Object.freeze({
    schema: 'fiezel-neural-voice-v2',
    provider: 'puter-cloud-primary-supertonic-offline-fallback',
    providerVersion: '1.2.1',
    providerSourceCommit: 'd4ef0569c79046dfd77fbb128502546a3afe5bef',
    transformersVersion: '3.5.1',
    onnxRuntimeWebVersion: '1.22.0-dev.20250409-89f8206ba4',
    modelId: 'kokoro-model',
    dtype: 'q8',
    device: 'wasm',
    cloudProvider: Object.freeze({
      id: 'puter-cloud',
      sdk: 'Puter.js v2',
      api: 'puter.ai.txt2speech',
      upstreamProvider: 'openai',
      model: 'gpt-4o-mini-tts',
      responseFormat: 'wav',
      userPays: true,
      clientApiKeyRequired: false
    }),
    localRouting: Object.freeze({
      scope: 'supertonic-offline-fallback-only',
      modelBasePath: './vendor/',
      voiceBaseUrl: './vendor/kokoro-model/voices',
      wasmBasePath: './vendor/kokoro-js/wasm/',
      remoteModelsAllowed: false,
      remoteVoiceDataAllowed: false,
      crossOriginRuntimeNetworkAllowed: false,
      sameOriginStaticAssetBootstrapAllowed: true,
      offlineAfterWarmRequired: true
    }),
    zeroCostPolicy: Object.freeze({
      // Compatibility object scoped ONLY to the Supertonic offline fallback.
      // The system-wide runtime policy below is the source of truth for the hybrid path.
      scope: 'supertonic-offline-fallback-only',
      paidApiAllowed: false,
      subscriptionAllowed: false,
      meteredBillingAllowed: false,
      vendorApiKeyAllowed: false,
      remoteInferenceAllowed: false,
      localInferenceRequired: true,
      buildTimePublicAssetDownloadAllowed: true,
      sameOriginStaticAssetBootstrapAllowed: true
    }),
    runtimePolicy: Object.freeze({
      primaryProvider: 'puter-cloud',
      remoteInferenceAllowed: true,
      crossOriginTtsRequestsAllowed: true,
      paidRuntimeAllowed: true,
      meteredBillingAllowed: true,
      userPays: true,
      vendorApiKeyAllowed: false,
      offlineAfterWarmRequired: false,
      offlineFallbackRequired: true,
      offlineFallbackProvider: 'supertonic-3',
      speculativePaidPrefetchAllowed: false
    }),
    voices: Object.freeze({
      fiezelPrimary: 'af_bella',
      fiezelAlternate: 'af_heart',
      listeningPool: Object.freeze(['af_bella', 'af_heart']),
      catalog: Object.freeze([
        Object.freeze({ id: 'af_bella', label: 'Bella', locale: 'en-US' }),
        Object.freeze({ id: 'af_heart', label: 'Heart', locale: 'en-US' })
      ])
    }),
    limits: Object.freeze({
      maxInputChars: 3600,
      targetChunkWords: 140,
      hardChunkWords: 190,
      maxQueueItems: 12
    }),
    // m025-48 delivery settings. One place, because the English bootstrap and the
    // Indonesian shim build separate engines over the same model and any drift between
    // them is heard immediately as two different voices.
    speech: Object.freeze({
      // Render and play one sentence at a time: the learner hears sentence one while
      // sentence two is still being generated, instead of waiting for the whole passage.
      streamSentences: true,
      // A breath group. Longer sentences are split again at clause punctuation.
      streamMaxWords: 26,
      // Length of the silence the model places at punctuation INSIDE a line, as a
      // multiple of what its duration predictor asked for. The vendored glue falls back
      // to 0.2, which is what made clause commas nearly inaudible; 0.4 restores the
      // breath without turning a comma into a full stop. Sentence-to-sentence spacing is
      // not affected - the player owns that (FiezelProsody.GAP_MS).
      silenceScale: 0.4
    }),
    fallback: Object.freeze({
      browserSpeechSynthesis: true,
      reason: 'Emergency-only browser fallback after Puter cloud and Supertonic fallback are unavailable.'
    })
  });

  return config;
});
