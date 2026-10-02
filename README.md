# Omzetin

Omzetin adalah kasir dan pelaporan keuangan F&B berbahasa Indonesia. Implementasi ini mendukung beberapa owner, usaha, dan outlet dengan alur buka shift, menerima pembayaran, menyerahkan pesanan, mengurangi bahan, dan membukukan transaksi ke jurnal.

Frontend menggunakan React dan Vite, API menggunakan Hono, dan database menggunakan PostgreSQL. Lokal memakai PGlite persisten; deployment disiapkan untuk Cloudflare Workers dengan Static Assets dan Neon. Aplikasi awal sudah berjalan di Cloudflare dengan database Neon.

## Menjalankan lokal

Gunakan Node.js 22.12 atau lebih baru dan pnpm 10.

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Buka http://127.0.0.1:5173. Akun demo lokal:

- Email: `demo@omzetin.local`
- Kata sandi: `OmzetinDemo123!`

Menu, resep, stok pembukaan, dan modal awal adalah data simulasi yang diberi label demo. Tidak ada penjualan palsu yang disisipkan. Data lokal tersimpan di `.local/data` dan bertahan setelah aplikasi dimulai ulang. PGlite menjalankan PostgreSQL di proses API, sehingga instalasi server database terpisah tidak diperlukan untuk mencoba aplikasi.

## Tiga aplikasi dan hak akses

| Peran dalam bisnis | Kasir                 | Manager                                      | Laporan                      |
| ------------------ | --------------------- | -------------------------------------------- | ---------------------------- |
| Karyawan           | Outlet penugasan      | —                                            | —                            |
| Manager            | Outlet penugasan      | Outlet penugasan                             | —                            |
| Management         | Seluruh outlet bisnis | Seluruh outlet bisnis, anggota dan kebijakan | Draft, publikasi dan dividen |
| Investor           | —                     | —                                            | Laporan terbit, hanya baca   |

Peran berlaku per bisnis. Satu akun dapat memiliki peran berbeda pada bisnis lain. Management dan investor dapat berjumlah lebih dari satu. Persentase dividen terpisah dari izin akses. Pemilih bisnis dan outlet mengganti konteks transaksi; keranjang tetap tersimpan per outlet dan pengguna.

**Aplikasi Kasir** (`/kasir`) menyediakan POS, pencarian menu, dine in/takeaway, pembayaran cash, Gojek, Grab, QRIS dan transfer manual, antrean penyerahan, struk, absensi masuk/pulang, pengajuan pendapatan eksternal dan pengeluaran. Buka shift memilih nama shift yang diatur manager. Setiap outlet memiliki satu laci/shift aktif. Tutup shift menyimpan fisik kas, selisih beserta alasan, dan mengajukan rekap per kanal. Modal serta selisih dipisahkan dari omzet.

**Aplikasi Manager** (`/manager`) menyediakan persetujuan pendapatan dan pengeluaran kasir, pengembalian untuk koreksi, penolakan, pembatalan catatan manual yang salah, pencairan platform sebagian/penuh, tiga kelompok biaya, jam buka dan hari operasional, jumlah/jam shift, pemeriksaan serta koreksi absensi, menu/resep dan stok. Pengeluaran yang dicatat manager/management langsung disetujui. Catatan pengeluaran terbayar memindahkan dana saat diajukan, sedangkan laporan menunggu persetujuannya; draft belum memindahkan dana. Pembatalan catatan yang salah membuat reversal, bukan menghapus jejak transaksi. Alasan diperlukan untuk keputusan selain persetujuan.

Menu **Tim & akses** khusus management dapat membuat akun, menghubungkan akun yang sudah ada, mengganti peran/penugasan, dan menonaktifkan akses. Akun baru memerlukan password minimal 12 karakter. Email/password tidak dikirim otomatis. Pengubahan akses mencabut sesi anggota; management terakhir tidak dapat dinonaktifkan. Menu **Bisnis & outlet** menambah usaha terpisah atau cabang, menyalin menu/resep dengan stok awal nol, dan mengelola modal, saldo serta penguncian periode.

**Aplikasi Laporan** (`/laporan`) menyimpan laporan bulanan outlet atau gabungan bisnis, berdasarkan dokumen yang disetujui. Investor hanya dapat melihat versi terbit; API menolak akses draft dan operasional. Laporan terbit adalah snapshot dengan nomor revisi. Publikasi menolak shift aktif dalam periode serta pengajuan yang belum diselesaikan. Revisi membutuhkan alasan dan mempertahankan arsip sebelumnya. Perubahan data/target biaya tidak mengubah snapshot lama.

## Rumus dan rasio laporan

- Total pendapatan = cash seluruh shift + Gojek final + Grab final + QRIS final + transfer, dikurangi refund yang sudah disetujui.
- Gross Profit = total pendapatan − pengeluaran harian.
- Net Profit = total pendapatan − pengeluaran harian − pengeluaran bulanan − pengeluaran tidak tetap.

Pendapatan mengikuti tanggal dana diterima. Kotor transaksi, kotor yang dicairkan, potongan, final bersih, persentase final/kotor, dan dana belum cair ditampilkan terpisah. Pencairan dapat dibagi ke beberapa tanggal/bulan. Potongan platform sudah tercermin dalam final dan tidak dikurangi lagi dari Net Profit. Transfer POS yang terverifikasi dipindahkan dari clearing ke bank saat shift ditutup. Refund POS penuh dapat mengurangi clearing yang belum cair atau bank setelah pencairan; koreksi dokumen pendapatan periode terkunci membutuhkan pembukaan periode asal.

Pengeluaran dikelompokkan **harian** (bahan/kemasan), **bulanan** (gaji, sewa, listrik, air, internet), dan **tidak tetap** (alat, promosi, logistik). Kategori tujuan biaya terpisah dari kelompok, sehingga marketing dalam biaya tidak tetap tidak dijumlahkan dua kali. Pembelian bahan melalui menu stok masuk belanja harian otomatis; jangan input pengeluarannya kembali. Rekap POS juga masuk otomatis; formulir pendapatan eksternal hanya untuk transaksi yang belum masuk POS.

Warna Gross Profit: ≥50% hijau, ≥40% kuning, ≥30% jingga, dan <30% merah termasuk ≥20% serta di bawah 20%. Rasio biaya memakai target awal gaji 25%, operasional 15%, tidak tetap 5%, marketing 3%. Ini anggaran awal yang dapat diubah management, bukan standar universal F&B. Hijau ≤target, kuning ≤110% target, jingga ≤125% target, selebihnya merah. Jika pendapatan nol/negatif, persentase menampilkan **Belum dapat dihitung**.

Ekspor CSV dapat dibuka di Excel; **Cetak / PDF** memakai dialog cetak browser. Export dan cetak laporan terbit menyertakan pembagian serta realisasi dividen sesuai izin pembaca. File XLSX khusus belum dibuat.

## Dividen dan infaq

Management menetapkan keputusan satu kali per bisnis/bulan dari revisi terbaru laporan gabungan. Infaq dapat dihitung dari persentase laba positif atau dimasukkan sebagai nominal. Infaq + total dividen tidak boleh melebihi laba tersedia. Saat rugi keduanya harus nol. Laba yang tidak dibagikan terlihat terpisah.

Bagian kelompok management + investor harus 100%; bagian individu pada setiap kelompok penerima harus 100%. Nominal dividen dihitung dengan desimal tepat dan pembagian sisa rupiah deterministik agar total penerima sama dengan total keputusan. Nama, peran dan persentase penerima disimpan pada keputusan, sehingga perubahan keanggotaan tidak mengubah riwayat.

Pembayaran dividen dicatat manual, dapat sebagian, dengan tanggal, sumber dana outlet aktif, referensi dan nomor/lokasi bukti. Sistem memeriksa saldo serta sisa bagian penerima, membukukan pengurangan bank/brankas sebagai distribusi ekuitas, dan tidak memasukkannya sebagai biaya operasional. Ini pencatatan pembayaran yang sudah dilakukan; aplikasi belum mengirim transfer bank. Investor hanya melihat rincian dividen/pembayarannya sendiri dan ringkasan keputusan. Infaq pada keputusan merupakan alokasi laba; realisasi pembayarannya belum memiliki alur jurnal khusus.

## Jurnal, stok, dan migrasi

Jurnal mempertahankan pembukuan penjualan ketika pesanan diserahkan dan HPP resep saat bahan dikonsumsi. Laporan bulanan di atas adalah laporan kas/belanja sesuai rumus pengguna; berbeda dari HPP akrual resep di jurnal. Bahan dicadangkan setelah pembayaran. Refund setelah penyerahan tidak mengembalikan bahan; pembatalan sebelum penyerahan melepas cadangan atau mencatat waste jika sudah disiapkan. Harga dan resep pesanan menyimpan snapshot.

Uang memakai hitungan desimal tepat, harga/pembayaran rupiah bulat, nilai bahan dan kuantitas enam desimal. Mutasi menggunakan transaksi database, lock bisnis/outlet, idempotensi, constraint jurnal seimbang, pengecekan keanggotaan ulang, dan audit. Periode terkunci menolak perubahan finansial. Riwayat ringkas dibatasi; agregat laporan menghitung seluruh dokumen pada periode.

`organizations` mengelompokkan bisnis. Tabel `businesses` dan kolom `business_id` tetap berarti outlet. `business_members` menyimpan peran aktif per bisnis, `member_outlets` penugasan, `operational_documents` pengajuan, `income_receipts` pencairan, `attendance` absensi, `published_reports` snapshot, `dividend_plans/payments` pembagian dan realisasi.

Schema dapat dijalankan ulang, mempertahankan dokumen/jurnal lama, dan tidak menghidupkan akses yang telah dicabut. Migrasi/startup menyelaraskan rekap shift, biaya serta pencairan QRIS lama tanpa membukukan uang lagi. Rekap lama memerlukan pemeriksaan manager sebelum dipublikasikan. Penugasan lama owner/kasir dipetakan menjadi management/karyawan.

## Pengujian

```powershell
pnpm test
pnpm exec playwright install chromium
pnpm test:browser
pnpm deploy:check
```

Pengujian transaksi menggunakan PostgreSQL di memori. Pengujian browser menjalankan aplikasi terpisah pada port 5174 dan 8788 dengan database di memori, sehingga data demo utama tidak berubah. Skenario browser mencakup login, shift, checkout, kembalian, penyerahan, laporan, unduhan CSV, semua layar, layout desktop dan ponsel, pembuatan outlet dan usaha, beberapa owner, akses kasir, keranjang terpisah, serta laporan gabungan. Pengujian backend juga memeriksa migrasi data versi satu outlet dan penolakan akses lintas usaha atau outlet. `deploy:check` melakukan pemeriksaan TypeScript, build frontend, dan dry run bundling Worker; perintah ini tidak menerbitkan aplikasi.

## Deployment Cloudflare dan Neon

1. Buat database Neon, lalu salin `.env.example` menjadi `.env` dan isi `DATABASE_URL`. Simpan connection string hanya di file lokal yang diabaikan Git atau secret layanan.
2. Jalankan `pnpm db:migrate`. Skrip memuat `.env`, membuat schema dan ekstensi `pgcrypto`, dan tidak memasukkan akun atau transaksi demo.
3. Login ke Cloudflare dengan `pnpm exec wrangler login`.
4. Jalankan `pnpm exec wrangler secret put DATABASE_URL` dan masukkan connection string Neon pada prompt. Jika diminta membuat Worker, gunakan nama `omzetin`.
5. Tidak perlu `BOOTSTRAP_SECRET`. Pendaftaran owner tersedia untuk publik.
6. Jalankan `pnpm deploy`, lalu buka URL Worker yang diberikan Wrangler.
7. Pilih **Belum punya akun? Daftar**, buat akun owner, bisnis, outlet pertama, dan saldo pembukaan. Setelah berhasil langsung masuk. Setiap pendaftaran membuat bisnis terpisah; email yang sudah terdaftar harus login. Management yang sudah login menambahkan bisnis dan outlet melalui Aplikasi Manager → Bisnis & outlet.
8. Tambahkan bahan, catat pembelian, buat menu dan resep, lalu buka shift untuk mulai bertransaksi.

Password baru memakai bcrypt dengan cost 12 atas digest SHA-256, dikerjakan melalui `pgcrypto` di PostgreSQL. Hal ini memindahkan beban hashing dari CPU Worker. Session cookie menggunakan HttpOnly dan SameSite Strict, serta Secure pada HTTPS. API memeriksa Origin untuk perubahan data. Connection string tidak dikirim ke frontend.

Build, migrasi Neon, dan deployment aplikasi awal telah berhasil pada layanan nyata. Pengujian beban/latensi dan pemulihan backup belum dilakukan. Paket gratis memiliki batas pemakaian; validasi kuota dan performa pada akun yang dipakai sebelum mengandalkan aplikasi untuk operasional. Rujukan deployment: [Cloudflare Static Assets](https://developers.cloudflare.com/workers/static-assets/), [batas Workers](https://developers.cloudflare.com/workers/platform/limits/), dan [Neon serverless driver](https://neon.com/docs/serverless/serverless-driver).

## Ditunda atau belum tersedia

Integrasi QRIS dinamis/gateway/webhook, GoFood/Gojek dan GrabFood/Grab, verifikasi/reset email serta notifikasi otomatis membutuhkan layanan/akses pihak lain dan tidak menjadi penghalang fitur inti manual. Bukti disimpan sebagai nomor atau lokasi dokumen; upload/penyimpanan file belum dibuat. Backup otomatis dan uji pemulihan juga belum tersedia.

Belum ada sinkronisasi transaksi offline, outbox, PWA/KDS, refund POS sebagian, pencocokan settlement per pesanan dari API platform, payroll/perhitungan gaji dari absensi, penjadwalan karyawan individual, transfer stok antaroutlet, arsip outlet, atau laporan pajak/penyusutan/utang. Jam/hari operasional menjadi acuan jadwal dan keterlambatan; belum membatasi jam transaksi.

Pendapatan manual yang sudah dicairkan tidak dapat diedit/dibatalkan biasa. Manager mencatat refund dengan referensi ke dokumen asal; saldo bank, batas dana yang dicairkan, dan periode diperiksa. Keputusan dividen tidak dapat dibatalkan atau digandakan lewat revisi laporan; keputusan dan pembayaran memakai dasar laporan asal. Penguncian periode masih per outlet melalui management.

Database belum memakai RLS atau pemisahan role migrasi/runtime. Pengujian kritis memakai PostgreSQL PGlite dan browser lokal; belum ada uji beban produksi, uji penetrasi, atau bukti restore backup. Batas dan kuota akun Cloudflare/Neon tetap berlaku.

## Struktur proyek

```text
src/client/          Antarmuka React dan laporan
src/server/app.ts    API dan otorisasi
src/server/domain.ts Perhitungan desimal, jurnal, stok, tanggal usaha
src/server/schema.ts Schema PostgreSQL dan constraint jurnal
src/server/db.ts     Adapter PGlite dan Neon
src/server/local.ts  API lokal dan data demo
src/server/worker.ts Entry point Cloudflare
scripts/migrate.ts   Pembuatan schema Neon
tests/               Pengujian transaksi dan browser
wrangler.jsonc       Konfigurasi Worker dan static assets
```

Master plan awal berada di `D:/code/private-project/OMZETIN-MASTER-PLAN.md`. Stack implementasi awal menyesuaikan arah Cloudflare dan Neon; fitur lanjutan pada master plan tetap merupakan roadmap.

Pendaftaran dibatasi maksimal 5 percobaan per alamat IP dalam 15 menit. Email belum diverifikasi dan pemulihan password belum tersedia pada versi ini. Secret runtime Cloudflare yang wajib hanya `DATABASE_URL`; secret bootstrap lama dapat dihapus.
