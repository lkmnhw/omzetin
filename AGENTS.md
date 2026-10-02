# Panduan kerja Omzetin

## Konteks proyek

Omzetin adalah aplikasi kasir dan pelaporan keuangan usaha F&B di Indonesia, dengan beberapa owner, beberapa usaha, dan beberapa outlet. Owner berlaku per usaha dan kasir ditugaskan per outlet. Kolom business_id pada dokumen menandai outlet; organizations mengelompokkan usaha. Gunakan Bahasa Indonesia untuk komunikasi dengan pemilik proyek dan antarmuka produk.

Master plan tersedia di `D:/code/private-project/OMZETIN-MASTER-PLAN.md` dan https://chatgpt.com/space/page_88126689baf48191a12a85fdb316cfb5. Baca bagian yang terkait dengan pekerjaan, bukan seluruh dokumen untuk setiap perubahan kecil.

Proyek dimulai dari nol. Jangan menggunakan atau memulihkan arsip `D:/code/private-project/omzetin-previous-2026-10-01` sebagai acuan implementasi kecuali diminta pengguna.

Pengguna tidak ingin menggunakan Vercel. Prioritaskan opsi deployment dengan paket gratis. Implementasi awal menggunakan React + Vite + Hono dan PostgreSQL Neon untuk Cloudflare Workers dengan Static Assets, mengikuti arahan pengguna untuk mengeksekusi rencana. Pengembangan lokal menggunakan PGlite persisten. Bedakan rekomendasi terbaru dari stack usulan dalam master plan, dan jangan mengklaim layanan produksi atau backup sudah tersedia hanya karena ada paket gratis.

## Penggunaan skills

Pakai skills yang tersedia dalam sesi sesuai jenis pekerjaan. Baca `SKILL.md` yang relevan sebelum pertama kali menggunakannya dan ikuti referensi yang dibutuhkan. Instruksi pengguna tetap diutamakan. Tidak perlu menjalankan semua skills dalam setiap tugas.

| Skill                           | Kapan digunakan untuk Omzetin                                                                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| create-plan                     | Ketika pengguna meminta rencana pekerjaan coding. Ikuti workflow read-only dan checklist skill; jangan menganggap permintaan rencana sebagai izin implementasi.                                 |
| frontend-design                 | Saat membangun atau menyempurnakan layar kasir, dashboard, formulir, komponen, atau landing page.                                                                                               |
| graphify                        | Saat menganalisis kode, arsitektur, dan hubungan antarmodul. Bila graph sudah tersedia, gunakan alur query skill; buat atau perbarui graph saat ada corpus yang relevan dan kebutuhan analisis. |
| pages:write-page                | Saat pengguna meminta membuat atau mengedit master plan atau dokumentasi di Page.                                                                                                               |
| pages:maintain-space            | Saat pengguna meminta merekonsiliasi bukti baru ke dokumentasi Page atau Space yang sudah ada.                                                                                                  |
| visualize:visualize             | Saat perbandingan, simulasi, atau alur interaktif membantu menjelaskan keputusan produk.                                                                                                        |
| spreadsheets:Spreadsheets       | Saat membuat atau memeriksa workbook laporan, CSV, data impor, atau template ekspor.                                                                                                            |
| documents:documents dan pdf:pdf | Saat menghasilkan dokumen Word atau PDF yang memerlukan pemeriksaan layout.                                                                                                                     |
| presentations:Presentations     | Saat membuat presentasi atau materi demo berbentuk slide.                                                                                                                                       |
| imagegen                        | Saat membutuhkan ilustrasi atau aset bitmap baru; gunakan SVG atau CSS untuk elemen yang lebih tepat dibuat sebagai vektor atau kode.                                                           |
| openai-docs                     | Untuk pertanyaan atau integrasi produk OpenAI serta pengaturan Codex dan skills.                                                                                                                |

Gunakan skill lain hanya ketika tugas sesuai deskripsinya atau pengguna memintanya secara eksplisit. Jangan memasang dependensi skill, menjalankan pipeline besar, membuat graph kosong, atau mengubah pengaturan global hanya untuk menunjukkan bahwa suatu skill telah dipakai.

## Desain dan kualitas produk

Saat memakai frontend-design, prioritaskan kebutuhan operasional kasir: input sentuh, keyboard, angka yang mudah dibaca, total yang selalu terlihat, dan penyelesaian transaksi cepat. Tetapkan token warna, tipografi, jarak, serta komponen yang konsisten. Gerak dan dekorasi tidak boleh mengganggu pencatatan pesanan atau pembayaran.

Periksa layout di tablet, laptop, dan ponsel sesuai pengguna layar. Pastikan label formulir, kontras, fokus keyboard, status loading atau gagal, retry, dan reduced motion. Hindari menampilkan angka contoh sebagai data usaha nyata.

Untuk logika uang dan stok, gunakan hitungan desimal tepat, idempotensi, transaksi atomik, isolasi usaha, dan audit. Refund, perubahan stok, serta koreksi jurnal harus dapat ditelusuri ke dokumen asal. Uji risiko yang relevan dengan perubahan; jangan menambahkan pengujian yang hanya mengulang implementasi untuk edit dokumentasi sederhana.

## Alur pengerjaan

1. Tentukan hasil yang diminta dan skill yang sesuai dengan pekerjaan tersebut.
2. Baca konteks, aturan proyek, dan bagian dokumentasi yang relevan.
3. Kerjakan sampai hasil konkret tersedia, dengan pemeriksaan yang sesuai.
4. Laporkan perubahan, cara verifikasi, dan keterbatasan yang masih ada.

Perintah yang tersedia: `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm test:browser`, `pnpm deploy:check`, dan `pnpm db:migrate`. Build, pengujian transaksi dan browser, serta dry run Cloudflare sudah dijalankan. Aplikasi awal telah dimigrasi dan dideploy ke Neon/Cloudflare; pengujian beban dan restore backup belum tersedia. Lihat README.md untuk setup, perilaku pembukuan, serta batas versi awal.

Fitur inti memakai tiga antarmuka `/kasir`, `/manager`, dan `/laporan`. Peran `business_members` berlaku per organisasi: management (dipetakan ke role API `owner`), manager, employee (`cashier`), dan investor. Investor hanya membaca laporan terbit dan rincian dividennya sendiri. Rekap POS dibuat otomatis saat shift tutup; pendapatan eksternal manual tidak boleh menggandakan POS. Laporan bulanan mengikuti pendapatan final pada tanggal diterima dan pengeluaran disetujui: gross = pendapatan − belanja harian, net = pendapatan − seluruh tiga kelompok biaya. HPP resep di jurnal tetap terpisah dari rumus belanja laporan. Snapshot laporan dan keputusan dividen mempertahankan versi asal. Pembayaran dividen mengurangi bank/brankas sebagai distribusi ekuitas, bukan biaya operasional.
