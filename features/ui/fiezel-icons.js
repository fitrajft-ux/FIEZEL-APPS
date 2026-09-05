/**
 * FIEZEL m025-115 - set ikon duotone milik FIEZEL sendiri.
 *
 * Brief redesign OWNER, bagian 4: "Ganti seluruh ikon generik (bottom nav, ikon modul
 * Grammar/Vocab/Reading) dari outline system-icon menjadi satu set ikon custom duotone
 * yang konsisten: garis + isian warna aksen, sudut membulat, terasa dirancang khusus
 * untuk FIEZEL - bukan dari icon library umum. Ini salah satu titik ungkit termurah untuk
 * mengubah kesan dari 'template' menjadi 'eksklusif' - prioritaskan."
 *
 * Aturan gambar, dipegang seluruh set supaya terbaca satu keluarga:
 *   - kanvas 24x24, semua bentuk hidup di dalam kotak 3..21 (tidak menyentuh tepi);
 *   - SATU bidang pastel (.fz-fill) per ikon, sisanya garis coklat (.fz-line);
 *   - tebal garis 1,7 dan seluruh ujung membulat - inilah yang membuat set ini terbaca
 *     hangat, bukan teknis;
 *   - tidak ada warna yang dipaku di dalam SVG. Warnanya datang dari CSS
 *     (--fz-i-fill / --fz-i-line), jadi ikon aktif di tab bar cukup ganti dua variabel,
 *     dan mode gelap ikut sendiri.
 *
 * Lucide TIDAK dilepas: ia masih dipakai untuk ikon sekali-pakai di dalam layar (panah,
 * centang, ikon pengaturan). Yang pindah ke set ini adalah kroma yang dilihat murid tiap
 * hari - tab bar, kartu modul, kartu skill, dan wajah pembimbing.
 */
(function (global) {
  'use strict';

  var ICONS = {
    /**
     * m025-128 PAW - maskot pembimbing FIEZEL. Arah 02, dipilih OWNER dari lima arah.
     *
     * KENAPA BENTUKNYA BEGINI. Keempat jarinya bukan bulatan melainkan balok bersudut
     * bulat dengan tinggi berbeda - bentuk yang sudah ada di logotype FIEZEL sendiri (dua
     * balok emas di antara hurufnya, yang juga jadi ikon "Tanya FIEZEL" di topbar). Itulah
     * klaim otentisitas yang diminta brief A.3: bentuknya tidak dipinjam dari icon library
     * mana pun, ia diambil dari wordmark FIEZEL. Sebagai bonus ia terbaca sebagai gelombang
     * suara naik - Listening dan Speaking - tanpa satu elemen tambahan.
     *
     * KENAPA PEKAT, BUKAN DUOTONE seperti ikon lain di berkas ini. PAW bukan ikon UI, ia
     * MARKA - sekelas wordmark, bukan sekelas tombol. Lagi pula bidangnya duduk di atas
     * lingkaran --yellow, dan .fz-fill default-nya juga --yellow: duotone di sini berarti
     * bantalannya hilang. Warnanya tetap tidak dipaku; ia mengikuti --fz-i-line.
     *
     * Tiap balok punya kelasnya sendiri karena sistem gerak per-halaman (style.css,
     * "PAW - gerak per halaman") menggerakkannya satu per satu.
     */
    paw: '<g class="fz-paw-sparks" aria-hidden="true">' +
      /* m025-129: dua belas partikel. Titik cx/cy tiap partikel BUKAN acak - ia simpul
         bentuk PAW itu sendiri (ujung tiap balok, dan enam titik keliling bantalan).
         Itulah kenapa mereka bisa "membentuk" marka: mereka memang sudah berdiri di
         tempat marka akan muncul, dan yang dianimasikan justru perjalanan MENJAUH lalu
         KEMBALI. Menganimasikan arah sebaliknya - lahir acak lalu dicari tempatnya -
         akan meleset satu-dua piksel pada tiap partikel dan terlihat seperti kotoran.
         --sx/--sy arah lontarnya, --sd giliran berangkatnya. */
      '<circle class="fz-paw-spark" cx="6.15" cy="9.8" r="1.05" style="--sx:-5.29px;--sy:-3.61px;--sd:0s"/>' +
      '<circle class="fz-paw-spark" cx="10.45" cy="8.6" r="1.05" style="--sx:-2.94px;--sy:-7.66px;--sd:.028s"/>' +
      '<circle class="fz-paw-spark" cx="14.75" cy="7.75" r="1.05" style="--sx:3.16px;--sy:-9.49px;--sd:.056s"/>' +
      '<circle class="fz-paw-spark" cx="19.05" cy="9.15" r="1.05" style="--sx:5.75px;--sy:-4.5px;--sd:.084s"/>' +
      '<circle class="fz-paw-spark" cx="8.4" cy="17.2" r="1.05" style="--sx:-7.4px;--sy:5.29px;--sd:.112s"/>' +
      '<circle class="fz-paw-spark" cx="12.6" cy="14.9" r="1.05" style="--sx:0px;--sy:6.4px;--sd:.14s"/>' +
      '<circle class="fz-paw-spark" cx="16.8" cy="17.2" r="1.05" style="--sx:6.67px;--sy:4.77px;--sd:.168s"/>' +
      '<circle class="fz-paw-spark" cx="12.6" cy="20.6" r="1.05" style="--sx:0px;--sy:10px;--sd:.196s"/>' +
      '<circle class="fz-paw-spark" cx="9.9" cy="19.9" r="1.05" style="--sx:-3.13px;--sy:6.6px;--sd:.224s"/>' +
      '<circle class="fz-paw-spark" cx="15.3" cy="19.9" r="1.05" style="--sx:3.9px;--sy:8.22px;--sd:.252s"/>' +
      '<circle class="fz-paw-spark" cx="7.3" cy="15.6" r="1.05" style="--sx:-6.19px;--sy:1.63px;--sd:.28s"/>' +
      '<circle class="fz-paw-spark" cx="17.9" cy="15.6" r="1.05" style="--sx:7.93px;--sy:2.09px;--sd:.308s"/>' +
      '</g>' +
      '<g class="fz-paw">' +
      '<rect class="fz-paw-bar" x="4.6" y="7.5" width="3.1" height="4.6" rx="1.55"/>' +
      '<rect class="fz-paw-bar" x="8.9" y="5.1" width="3.1" height="7" rx="1.55"/>' +
      '<rect class="fz-paw-bar" x="13.2" y="3.4" width="3.1" height="8.7" rx="1.55"/>' +
      '<rect class="fz-paw-bar" x="17.5" y="6.2" width="3.1" height="5.9" rx="1.55"/>' +
      '<path class="fz-paw-pad" d="M12.6 14c3.5 0 5.9 1.9 5.9 4.1 0 2-2 3.4-5.9 3.4s-5.9-1.4-5.9-3.4c0-2.2 2.4-4.1 5.9-4.1Z"/>' +
      '</g>',
    /* Tab bar.
       m025-129: kelima ikon ini digambar ULANG. OWNER: "icon taskbarnya terlalu jadul
       kurang modern dan eye catching."

       Ia benar, dan sebabnya bisa disebut: versi sebelumnya garis tipis 1,7 dengan satu
       bidang pastel kecil di belakangnya. Bahasa itu - outline tipis, bidang malu-malu -
       memang bahasa ikon 2020, dan pada 24 px di atas kapsul kuning ia nyaris tidak
       punya berat sama sekali.

       Yang berubah: BIDANG jadi bentuk utamanya, garis tinggal menegaskan tepi. Siluetnya
       dibuat lebih gemuk dan lubangnya lebih besar supaya tetap terbaca saat mengecil.
       Ini bahasa ikon yang dipakai aplikasi belajar yang jadi acuan brief (Duolingo), dan
       ia jauh lebih tahan di ukuran kecil daripada garis tipis.

       Aturan keluarga tetap: kanvas 24x24, isi di dalam kotak 3..21, satu bidang per
       ikon, sudut membulat, tidak ada warna yang dipaku. */
    /* m025-266: dua ikon tab bar baru. Kelima ikon nav harus terbaca SATU keluarga pada
       24 px: siluet bidang yang sebanding, satu detail garis, tidak ada yang lebih ramai
       sendiri. `skills` (lima batang tipis) dan `map` (lipatan + dua garis) melanggar
       itu - yang satu terlalu ringan, yang lain terlalu ramai - jadi tab Latihan dan
       Progres pindah ke dua ikon ini. Keduanya TETAP tersedia untuk kartu di dalam layar. */
    practice: '<rect class="fz-fill" x="3.6" y="7" width="13.6" height="13.4" rx="3.4"/>' +
      '<rect class="fz-line" x="3.6" y="7" width="13.6" height="13.4" rx="3.4"/>' +
      '<path class="fz-line" d="M7.4 7V6.2a2.6 2.6 0 0 1 2.6-2.6h7.8a2.6 2.6 0 0 1 2.6 2.6v7.6a2.6 2.6 0 0 1-2.6 2.6h-.6"/>' +
      '<path class="fz-line" d="m7.6 13.8 2.2 2.2 4.2-4.6"/>',
    progress: '<rect class="fz-fill" x="3.6" y="3.6" width="16.8" height="16.8" rx="4.4"/>' +
      '<rect class="fz-line" x="3.6" y="3.6" width="16.8" height="16.8" rx="4.4"/>' +
      '<path class="fz-line" d="m7.2 15.4 3.4-3.8 2.6 2.4 4-4.6"/>' +
      '<path class="fz-line" d="M14.4 9.4h2.8v2.8"/>',
    home: '<path class="fz-fill" d="M12 3.6 21 11v7.6a2.4 2.4 0 0 1-2.4 2.4H5.4A2.4 2.4 0 0 1 3 18.6V11z"/>' +
      '<path class="fz-line" d="M12 3.6 21 11v7.6a2.4 2.4 0 0 1-2.4 2.4H5.4A2.4 2.4 0 0 1 3 18.6V11z"/>' +
      '<path class="fz-line" d="M9.5 21v-4.6a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V21"/>',
    vocab: '<rect class="fz-fill" x="3.6" y="3.6" width="16.8" height="16.8" rx="4.4"/>' +
      '<rect class="fz-line" x="3.6" y="3.6" width="16.8" height="16.8" rx="4.4"/>' +
      '<path class="fz-line" d="M8.4 16.2 12 7.4l3.6 8.8M9.7 13.6h4.6"/>',
    grammar: '<path class="fz-fill" d="M6 3.9h12a3.3 3.3 0 0 1 3.3 3.3v6.2a3.3 3.3 0 0 1-3.3 3.3h-4.6L8.5 20.4v-3.7H6a3.3 3.3 0 0 1-3.3-3.3V7.2A3.3 3.3 0 0 1 6 3.9Z"/>' +
      '<path class="fz-line" d="M6 3.9h12a3.3 3.3 0 0 1 3.3 3.3v6.2a3.3 3.3 0 0 1-3.3 3.3h-4.6L8.5 20.4v-3.7H6a3.3 3.3 0 0 1-3.3-3.3V7.2A3.3 3.3 0 0 1 6 3.9Z"/>' +
      '<path class="fz-line" d="M7.6 8.9h8.8M7.6 12.3h5.4"/>',
    reading: '<path class="fz-fill" d="M12 6.6C10 4.9 7.6 4.2 3.6 4.2v13.2c4 0 6.4.7 8.4 2.4 2-1.7 4.4-2.4 8.4-2.4V4.2c-4 0-6.4.7-8.4 2.4Z"/>' +
      '<path class="fz-line" d="M12 6.6C10 4.9 7.6 4.2 3.6 4.2v13.2c4 0 6.4.7 8.4 2.4 2-1.7 4.4-2.4 8.4-2.4V4.2c-4 0-6.4.7-8.4 2.4Z"/>' +
      '<path class="fz-line" d="M12 6.6v13.2"/>',
    map: '<path class="fz-fill" d="M8.9 3.9 15.1 6.4l5.3-2.2v12.6l-5.3 2.2-6.2-2.5-5.3 2.2V6.1z"/>' +
      '<path class="fz-line" d="M8.9 3.9 15.1 6.4l5.3-2.2v12.6l-5.3 2.2-6.2-2.5-5.3 2.2V6.1z"/>' +
      '<path class="fz-line" d="M8.9 3.9v14.6M15.1 6.4V21"/>',
    /* Empat skill inti tes */
    listening: '<path class="fz-fill" d="M7.6 10.6a4.4 4.4 0 1 1 8.8 0c0 2-1 2.7-1.8 3.6-.7.8-1 1.5-1 2.6a2.2 2.2 0 0 1-4.4 0z"/>' +
      '<path class="fz-line" d="M7.6 10.4a4.4 4.4 0 0 1 8.8.2c0 2-1 2.7-1.8 3.6-.7.8-1 1.5-1 2.6a2.2 2.2 0 0 1-4.3.5"/>' +
      '<path class="fz-line" d="M10.4 10.6a1.7 1.7 0 0 1 3.2.4"/><path class="fz-line" d="M19 8.2c.8 1.2 1.2 2.5 1.2 3.9"/>',
    speaking: '<rect class="fz-fill" x="9.4" y="3.6" width="5.2" height="9.4" rx="2.6"/>' +
      '<rect class="fz-line" x="9.4" y="3.6" width="5.2" height="9.4" rx="2.6"/>' +
      '<path class="fz-line" d="M6.4 11.4a5.6 5.6 0 0 0 11.2 0M12 17v3.2M9.4 20.2h5.2"/>',
    reading_skill: '<path class="fz-fill" d="M5.4 5.6h6.6v12.9c-1.6-1.1-3.4-1.6-6.6-1.6z"/>' +
      '<path class="fz-line" d="M12 7.4C10.4 6.1 8.6 5.6 5.4 5.6a.9.9 0 0 0-.9.9v9.6c0 .5.4.9.9.9 3.1 0 4.9.5 6.6 1.6 1.7-1.1 3.5-1.6 6.6-1.6.5 0 .9-.4.9-.9V6.5a.9.9 0 0 0-.9-.9c-3.2 0-5 .5-6.6 1.8z"/>' +
      '<path class="fz-line" d="M12 7.4v11.6"/>',
    writing: '<path class="fz-fill" d="m13.4 6.2 4.4 4.4-7.6 7.6-4.4.9.9-4.4z"/>' +
      '<path class="fz-line" d="m14.6 5 4.4 4.4M13.4 6.2l4.4 4.4-7.6 7.6-4.4.9.9-4.4z"/>' +
      '<path class="fz-line" d="M4.6 20.4h7.2"/>',
    /* Modul pendukung */
    library: '<path class="fz-fill" d="M5.4 6h4v13h-4zM11 6h3.4v13H11z"/>' +
      '<path class="fz-line" d="M5.4 6.9c0-.5.4-.9.9-.9h2.2c.5 0 .9.4.9.9v11.2c0 .5-.4.9-.9.9H6.3a.9.9 0 0 1-.9-.9z"/>' +
      '<path class="fz-line" d="M11 6.9c0-.5.4-.9.9-.9h1.6c.5 0 .9.4.9.9v11.2c0 .5-.4.9-.9.9h-1.6a.9.9 0 0 1-.9-.9z"/>' +
      '<path class="fz-line" d="m16.4 7.6 1.7-.4c.5-.1 1 .2 1.1.7l2 9.6c.1.5-.2 1-.7 1.1l-1.4.3"/>',
    /* m025-266: papan kelas disederhanakan - satu goresan kapur, bukan tiga baris teks,
       supaya di 24 px ia sebobot tetangganya di tab bar. */
    classroom: '<rect class="fz-fill" x="3.8" y="4" width="16.4" height="12.4" rx="3.2"/>' +
      '<rect class="fz-line" x="3.8" y="4" width="16.4" height="12.4" rx="3.2"/>' +
      '<path class="fz-line" d="M12 16.4v3.6M8.8 20h6.4M8.2 10.2h5.6"/>',
    skills: '<path class="fz-fill" d="M6 10h2.2v4H6zM10.9 7.4h2.2v9.2h-2.2zM15.8 9h2.2v6h-2.2z"/>' +
      '<path class="fz-line" d="M6.9 9.4v5.2M12 6.6v10.8M17.1 8.4v7.2M3.6 11.2v1.6M20.4 11.2v1.6"/>',
    /* m025-246: tab bar sekarang punya EMPAT tujuan dan salah satunya Pengaturan.
       Ikon lucide `sliders-horizontal` sudah dipakai tombol gigi di topbar, tetapi
       tab bar adalah wilayah set duotone (kontrak refreshIcons di app.js: duotone
       memegang kroma yang dilihat murid tiap hari, lucide memegang ikon sekali-pakai
       DI DALAM layar). Meminjam ikon lucide ke sana akan membuat satu dari empat tab
       digambar dengan berat garis dan bahasa bentuk yang berbeda dari tiga tetangganya.
       Aturan keluarga yang sama dengan ikon lain: kanvas 24x24, isi di kotak 3..21,
       satu bidang, tanpa warna yang dipaku. */
    settings: '<path class="fz-fill" d="M4.2 7.2h15.6v2.4H4.2zM4.2 14.4h15.6v2.4H4.2z"/>' +
      '<path class="fz-line" d="M3.6 8.4h16.8M3.6 15.6h16.8"/>' +
      '<circle class="fz-line" cx="9.2" cy="8.4" r="2.3"/>' +
      '<circle class="fz-line" cx="15" cy="15.6" r="2.3"/>',
    /* Wajah pembimbing FIEZEL - bentuknya milik FIEZEL sendiri, bukan maskot pihak lain:
       satu kotak membulat (huruf F yang dibulatkan), dua mata, satu percik. */
    coach: '<rect class="fz-fill" x="4.2" y="4.6" width="15.6" height="14.4" rx="5"/>' +
      '<rect class="fz-line" x="4.2" y="4.6" width="15.6" height="14.4" rx="5"/>' +
      '<path class="fz-line" d="M9.2 11.4v1.4M14.8 11.4v1.4M10.2 15.4c1.1.9 2.5.9 3.6 0"/>' +
      '<path class="fz-line" d="m18.6 3.2.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z"/>',
    /* Streak: dipakai badge, satu-satunya tempat koral jadi bidang penuh. */
    flame: '<path class="fz-fill" d="M12 3.8c3.4 3 5 5.3 5 7.9a5 5 0 0 1-10 0c0-1.5.6-2.9 1.8-4.4.5 1 .9 1.6 1.6 2 .2-2.1.7-3.9 1.6-5.5z"/>' +
      '<path class="fz-line" d="M12 3.8c3.4 3 5 5.3 5 7.9a5 5 0 0 1-10 0c0-1.5.6-2.9 1.8-4.4.5 1 .9 1.6 1.6 2 .2-2.1.7-3.9 1.6-5.5z"/>' +
      '<path class="fz-line" d="M12 12.6c1.2 1 1.8 1.9 1.8 2.8a1.8 1.8 0 0 1-3.6 0c0-.9.6-1.8 1.8-2.8z"/>',
    /* Profil murid / akun dan teman untuk navigasi utama.
       m025-266: bidangnya pindah ke BAHU, bukan kepala - lingkaran r4 nyaris tak punya
       luas, sehingga di tab bar ikon ini terbaca garis tipis di antara empat bidang. */
    profile: '<path class="fz-fill" d="M4.4 20.4c0-4 3.4-7 7.6-7s7.6 3 7.6 7z"/>' +
      '<path class="fz-line" d="M4.4 20.4c0-4 3.4-7 7.6-7s7.6 3 7.6 7"/>' +
      '<circle class="fz-line" cx="12" cy="7.8" r="4.2"/>'
  };

  var SVG_HEAD = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">';

  function markup(name) {
    var body = ICONS[name];
    return body ? SVG_HEAD + body + '</svg>' : '';
  }

  /**
   * Mengisi setiap [data-fz-icon] yang belum terisi. Idempoten dengan sengaja: ia dipanggil
   * dari refreshIcons() setiap kali layar dicat ulang, dan mencat ulang SVG yang sudah benar
   * hanya membuang waktu render.
   */
  function hydrate(root) {
    var scope = root || (typeof document !== 'undefined' ? document : null);
    if (!scope || !scope.querySelectorAll) return 0;
    var nodes = scope.querySelectorAll('[data-fz-icon]');
    var filled = 0;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var name = el.getAttribute('data-fz-icon');
      if (el.getAttribute('data-fz-icon-done') === name) continue;
      var svg = markup(name);
      if (!svg) continue;
      el.innerHTML = svg;
      el.classList.add('fz-i');
      el.setAttribute('aria-hidden', 'true');
      el.setAttribute('data-fz-icon-done', name);
      filled++;
    }
    return filled;
  }

  global.FiezelIcons = { icons: ICONS, markup: markup, hydrate: hydrate, names: Object.keys(ICONS) };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.FiezelIcons;
})(typeof self !== 'undefined' ? self : this);
