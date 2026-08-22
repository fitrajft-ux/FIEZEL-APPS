(function(root){
  'use strict';
  root.FIEZEL_SPEAKING_LISTENING_CONFIG=Object.freeze({
    enabled:true,
    storageKey:'fiezel-sl-v1-state',
    language:'en-US',
    ttsRate:.86,
    maxListeningReplays:2,
    recognitionMode:'browser-default',
    persistRawAudio:false,
    persistRawTranscript:false,
    aggregateEventLimit:120,
    // R3 memerlukan penyebut untuk cakupan target, dan app.js tidak bisa menunggu bank soal
    // dimuat secara async hanya untuk merender Home. Angka ini dijaga gate: kalau bank
    // berubah dan konstanta ini tidak, gate gagal - jadi tidak bisa diam-diam basi.
    bankCounts:Object.freeze({listening:1407,speaking:36}),
    neuralVoicePreferred:true
  });
})(typeof globalThis!=='undefined'?globalThis:this);
