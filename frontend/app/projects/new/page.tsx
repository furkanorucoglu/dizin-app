"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileArchive,
  FileCheck2,
  FileText,
  Loader2,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { UploadDropzone } from "@/components/upload-dropzone";

const PDF_ACCEPT = { "application/pdf": [".pdf"] };
const DOCX_ACCEPT = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};

const STEPS = [
  { id: 1, title: "Başlık", description: "Proje adını belirle" },
  { id: 2, title: "Dosyalar", description: "PDF ve DOCX yükle" },
  { id: 3, title: "Kontrol", description: "Oluşturmadan önce incele" },
] as const;

export default function NewProjectPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [title, setTitle] = useState("");
  const [enPdf, setEnPdf] = useState<File | null>(null);
  const [trPdf, setTrPdf] = useState<File | null>(null);
  const [indexDocx, setIndexDocx] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const completedFiles = useMemo(
    () => [enPdf, trPdf, indexDocx].filter(Boolean).length,
    [enPdf, trPdf, indexDocx],
  );

  async function handleCreate() {
    if (!title.trim()) {
      toast.error("Proje başlığı gerekli");
      return;
    }
    if (!enPdf || !trPdf || !indexDocx) {
      toast.error("Üç dosya da gerekli");
      return;
    }

    setBusy(true);
    try {
      const project = await api.createProject(title.trim());
      await api.upload(project.id, "en_pdf", enPdf);
      await api.upload(project.id, "tr_pdf", trPdf);
      await api.upload(project.id, "index_docx", indexDocx);
      toast.success("Proje oluşturuldu, yönlendiriliyor…");
      router.push(`/projects/${project.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[360px_1fr]">
      <aside className="surface-card h-fit overflow-hidden p-6 lg:sticky lg:top-24">
        <div className="rounded-3xl bg-slate-950 p-5 text-white shadow-xl shadow-slate-900/20">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.12]">
            <Sparkles className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Yeni Proje</h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Dizin çevirisi için gereken üç dosyayı kontrollü ve güvenli bir akışla yükle.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          {STEPS.map((item) => {
            const active = step === item.id;
            const done = step > item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === 1 || title.trim()) setStep(item.id);
                }}
                className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
                  active
                    ? "border-slate-950 bg-slate-950 text-white shadow-lg shadow-slate-900/10"
                    : done
                      ? "border-emerald-200 bg-emerald-50 text-slate-900"
                      : "border-slate-200 bg-white/70 text-slate-600 hover:bg-white"
                }`}
              >
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                    active ? "bg-white text-slate-950" : done ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {done ? <CheckCircle2 className="h-4 w-4" /> : item.id}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{item.title}</span>
                  <span className={`mt-0.5 block text-xs ${active ? "text-slate-300" : "text-slate-500"}`}>
                    {item.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Yükleme kontrolü
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-slate-500">
            <MiniFileStatus label="EN" done={!!enPdf} />
            <MiniFileStatus label="TR" done={!!trPdf} />
            <MiniFileStatus label="DOCX" done={!!indexDocx} />
          </div>
        </div>
      </aside>

      <section className="flex flex-col gap-6">
        <div className="surface-card p-1">
          <div className="flex items-center justify-between gap-3 rounded-[1.35rem] bg-white/70 px-5 py-4">
            <div>
              <p className="eyebrow">Adım {step}/3</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                {step === 1 ? "Proje bilgisi" : step === 2 ? "Kaynak dosyalar" : "Son kontrol"}
              </h2>
            </div>
            <Badge variant={completedFiles === 3 ? "success" : "muted"}>{completedFiles}/3 dosya</Badge>
          </div>
        </div>

        {step === 1 && (
          <Card className="surface-card border-slate-200/80">
            <CardHeader>
              <CardTitle className="text-xl">Proje başlığı</CardTitle>
              <CardDescription>
                Kitap adını ya da çalışma adını yaz. Bu isim dashboard ve export sürecinde referans olur.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="title">Başlık</Label>
                <Input
                  id="title"
                  placeholder="Örn. Our Brains — Türkçe Dizin Kontrolü"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  autoFocus
                  className="h-12 rounded-2xl bg-white text-base"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button onClick={() => setStep(2)} disabled={!title.trim()} className="rounded-2xl">
                  Devam <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card className="surface-card border-slate-200/80">
            <CardHeader>
              <CardTitle className="text-xl">Dosyaları yükle</CardTitle>
              <CardDescription>
                EN orijinal PDF, TR çeviri PDF ve mevcut dizin DOCX dosyasını ekle.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <UploadBlock icon={<FileText className="h-5 w-5" />} title="İngilizce PDF" description="Orijinal kaynak kitap">
                <UploadDropzone label="İngilizce PDF (orijinal)" accept={PDF_ACCEPT} file={enPdf} onSelect={setEnPdf} />
              </UploadBlock>
              <UploadBlock icon={<FileArchive className="h-5 w-5" />} title="Türkçe PDF" description="Çeviri metni">
                <UploadDropzone label="Türkçe PDF (çeviri)" accept={PDF_ACCEPT} file={trPdf} onSelect={setTrPdf} />
              </UploadBlock>
              <UploadBlock icon={<FileCheck2 className="h-5 w-5" />} title="Dizin DOCX" description="Mevcut dizin belgesi">
                <UploadDropzone label="Mevcut dizin (.docx)" accept={DOCX_ACCEPT} file={indexDocx} onSelect={setIndexDocx} />
              </UploadBlock>

              <div className="flex justify-between gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(1)} className="rounded-2xl bg-white">
                  <ArrowLeft className="h-4 w-4" /> Geri
                </Button>
                <Button onClick={() => setStep(3)} disabled={!enPdf || !trPdf || !indexDocx} className="rounded-2xl">
                  Devam <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card className="surface-card border-slate-200/80">
            <CardHeader>
              <CardTitle className="text-xl">Onay</CardTitle>
              <CardDescription>
                Her şey doğruysa projeyi oluştur. Ardından analiz ekranına yönlendirileceksin.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <ReviewRow label="Başlık" value={title} />
              <ReviewRow label="EN PDF" value={enPdf?.name ?? "-"} />
              <ReviewRow label="TR PDF" value={trPdf?.name ?? "-"} />
              <ReviewRow label="Dizin" value={indexDocx?.name ?? "-"} />

              <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50/80 p-4 text-sm leading-6 text-blue-900">
                <div className="flex items-start gap-3">
                  <UploadCloud className="mt-0.5 h-5 w-5 shrink-0" />
                  <p>
                    Proje oluşturulduktan sonra dosyalar sırayla yüklenecek. Yükleme bitmeden sayfayı kapatma.
                  </p>
                </div>
              </div>

              <div className="flex justify-between gap-2 pt-4">
                <Button variant="outline" onClick={() => setStep(2)} disabled={busy} className="rounded-2xl bg-white">
                  <ArrowLeft className="h-4 w-4" /> Geri
                </Button>
                <Button onClick={handleCreate} disabled={busy} className="rounded-2xl">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {busy ? "Yükleniyor…" : "Projeyi Oluştur"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

function UploadBlock({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white/[0.72] p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-100 text-slate-700">{icon}</span>
        <div>
          <div className="font-semibold text-slate-950">{title}</div>
          <div className="text-xs text-slate-500">{description}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function MiniFileStatus({ label, done }: { label: string; done: boolean }) {
  return (
    <div className={`rounded-2xl border px-2 py-3 ${done ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500"}`}>
      <CheckCircle2 className={`mx-auto mb-1 h-4 w-4 ${done ? "text-emerald-600" : "text-slate-300"}`} />
      {label}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white/[0.72] px-4 py-3">
      <span className="text-slate-500">{label}</span>
      <span className="max-w-[70%] truncate text-right font-semibold text-slate-950">{value}</span>
    </div>
  );
}
