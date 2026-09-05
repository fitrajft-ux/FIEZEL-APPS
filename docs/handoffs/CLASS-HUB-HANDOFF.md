# Class Hub: Kelas sebagai ruang Guru ↔ Murid ↔ Braincore

Otoritas: OWNER. Dokumen ini adalah kontrak singkat untuk subsistem `features/class-hub/`
yang masuk di build `m025-259`. Auditnya — kondisi sebelum, delapan gap (G1–G8), dan
arsitektur yang dipilih — hidup lengkap di `docs/class-hub-audit.md`; yang ada di sini
hanya hal-hal yang wajib dijaga siapa pun yang menyentuhnya berikutnya.

## Status

Tahap 1 SELESAI dan terpasang: `features/class-hub/fiezel-class-hub.js`,
`fiezel-braincore-review.js`, `class-hub.css`, dimuat dari `index.html`, dengan gerbang
sendiri di `tests/class-hub-test.js`.

## Kontrak yang harus dijaga

1. **Tab "Kelas" adalah kelas, bukan tutor suara.** Gap G1/G8 lahir justru karena global
   `classroom` ditimpa `tutor-v3` dan pembungkus di `app.js` membandingkan dirinya
   sendiri. Siapa pun yang menambah layar bernama sama wajib memastikan pintu bottom nav
   tetap menunjuk hub kelas.

2. **Bukti per-soal, bukan hanya `{c,t}`.** Laporan murid diperluas supaya guru bisa
   melihat miskonsepsi, bukan sekadar skor. Menyempitkannya kembali ke agregat berarti
   mengembalikan G5, dan tahap Braincore di atasnya kehilangan masukannya.

3. **Braincore hanya MENYARANKAN.** Alur `Original → Analysis → Suggested → Final`
   berakhir di keputusan guru. Tidak boleh ada jalur yang menyimpan hasil Braincore
   sebagai final tanpa persetujuan itu.

4. **Gerbang DOM-stub jalan di Node 22+.** `tests/class-hub-test.js` memalsukan
   `window`, `localStorage`, dan `navigator`. Sejak Node 22, `navigator` adalah getter
   global tanpa setter: `globalThis.navigator = {...}` melempar `TypeError` dan gerbang
   ini merah di CI walau hijau di mesin lama. Pakai `Object.defineProperty`. Aturan yang
   sama berlaku untuk setiap global baru yang dipalsukan di gerbang mana pun.

## Yang belum, dan tidak dikerjakan di tahap ini

- Status *sedang mengerjakan* dan *terlambat* (G4) belum dihitung dari deadline.
- Identitas guru ke murid (G7) masih memakai nama kelas pada sebagian jalur.
- Tulis/impor soal sendiri oleh guru (G3) belum ada; sumbernya tetap bank soal.

## Kaitan dengan pipa notifikasi

Kabar tugas guru ke murid tetap lewat `features/notify/fiezel-inbox.js` dan tunduk pada
kontrak di `docs/handoffs/NOTIFY-PIPELINE-HANDOFF.md` — termasuk bahwa `inbox.poll()`
diam total tanpa pesan bila murid belum memasukkan kode kelas. Class Hub tidak mengubah
syarat itu, jadi murid yang belum bergabung tetap tidak menerima apa pun.

## m025-266: soal bergambar harus membawa gambarnya ke runner kelas

Owner melaporkan: *"banyak soal di dalam kelas tentang kata Inggris apa yang cocok untuk
gambar ini, tapi banyak sekali soal yang tidak ada gambarnya, jadi siswa tidak bisa
menjawab."*

Datanya tidak pernah hilang. Bank soal utuh — `fiezel-review-bank.js` menyimpan 20 gambar
SVG inline di tabel `PIC`, dan `byId('gpi:…')` membangun ulang soalnya lengkap dengan
`picture`. Latihan mandiri (`fiezel-learner-flow.js`) dan duel (`fiezel-duel.js`)
menggambarnya dengan benar. Yang bolong adalah **penampilnya**: runner kelas mencetak
`item.context` dan `item.prompt` tetapi **tidak pernah menyebut `item.picture` sama sekali**
— kata `picture` muncul nol kali di seluruh berkasnya.

Akibatnya setiap soal `contextKind: 'picture'` di dalam tugas guru sampai ke murid sebagai
pertanyaan **"Kata Inggris apa yang cocok untuk gambar ini?" tanpa satu pun gambar**. Itu
bukan cacat kosmetik: soalnya mustahil dijawab, murid hanya bisa menebak satu dari empat,
dan bukti yang mengalir ke Braincore jadi kebisingan — jawaban acak dicatat seolah
pengukuran kemampuan.

### Penyebab strukturalnya: satu bank, tiga penampil

`fiezel-review-bank.js` dipakai oleh TIGA penampil — latihan mandiri, duel, dan runner
kelas — dan markup gambarnya dulu **disalin ke masing-masing**. Penampil yang lupa
menyalinnya tidak membuat apa pun merah. Tidak ada gerbang yang pernah menuntut
"penampil soal wajib menggambar soal bergambar", karena yang diuji hanya alur jawab-nilai.

### Kontrak yang harus dijaga

1. **Markup gambar punya SATU sumber: `FiezelReviewBank.pictureHtml(item, cls)`.** Siapa
   pun yang menampilkan soal dari bank ini memanggil fungsi itu, bukan menyalin tag
   `<svg>`-nya. Penampil keempat yang menyalin akan mengulang bug yang sama.
2. **`pictureHtml` aman dipanggil untuk soal apa pun**: soal non-gambar dan item kosong
   mengembalikan string kosong, jadi pemanggil tidak perlu menjaga sendiri.
3. **Gerbangnya menguji PERILAKU, bukan teks sumber.** Versi pertama gerbang ini hanya
   mencari kata `pictureHtml` di berkasnya, dan tetap hijau ketika pemanggilannya
   dilumpuhkan — hijau yang berarti "tidak diukur". Yang berlaku sekarang menjalankan
   runner kelas sungguhan dengan satu soal bergambar dan menuntut SVG-nya muncul di
   keluaran. Diverifikasi merah saat perbaikan dibatalkan.
4. **Gambar tetap punya nama aksesibel** (`role="img"` + `aria-label="Gambar: …"`), karena
   di soal ini gambarnya BUKAN hiasan — ia isi pertanyaannya.

### Yang belum dikerjakan

- `fiezel-learner-flow.js` dan `fiezel-duel.js` masih memakai salinan markupnya
  masing-masing. Keduanya benar hari ini, jadi tidak disentuh di sini; memindahkannya ke
  `pictureHtml` adalah pembersihan tersendiri yang menyentuh gerbang render dan emas.
- `normalizeCustomItems` di `workers/api/teacher/class-sync-core.js` memakai daftar-putih
  bidang (`id, prompt, options, answer, skill, context, why`) yang membuang `contextKind`
  dan `picture`. Itu **tidak** menyebabkan bug ini — soal bank dikirim lewat `itemIds` dan
  diselesaikan murid dari bank lokal, sedangkan `items` hanya memuat soal tulisan guru yang
  memang tanpa gambar. Tetapi kalau kelak guru boleh menyusun soal bergambar sendiri,
  daftar-putih itu harus ikut diperluas atau gambarnya akan hilang di server.
