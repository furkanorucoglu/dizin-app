"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FolderKanban,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import type { ProjectStatus } from "@/lib/types";
import { Badge, BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const STATUS_LABEL: Record<ProjectStatus, { text: string; variant: BadgeVariant }> = {
  draft: { text: "Taslak", variant: "muted" },
  analyzing: { text: "Analiz ediliyor", variant: "warning" },
  ready: { text: "Hazır", variant: "default" },
  processing: { text: "İşleniyor", variant: "warning" },
  done: { text: "Tamamlandı", variant: "success" },
  error: { text: "Hata", variant: "danger" },
};

function StatCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: number;
  description: string;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function HomePage() {
  const queryClient = useQueryClient();

  const {
    data: projects = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["projects"],
    queryFn: api.listProjects,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Proje silindi");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalProjects = projects.length;

  const completedProjects = projects.filter(
    (project) => project.status === "done"
  ).length;

  const unfinishedProjects = projects.filter(
    (project) => project.status !== "done" && project.status !== "error"
  ).length;

  const errorProjects = projects.filter(
    (project) => project.status === "error"
  ).length;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Dizin Studio</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            Projeler
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Kitap dizinlerini Türkçe sayfa numaralarına çevir, incele ve çıktılarını yönet.
          </p>
        </div>

        <Link href="/projects/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Yeni Proje
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Toplam Proje"
          value={totalProjects}
          description="Sistemde kayıtlı proje sayısı"
          icon={FolderKanban}
        />
        <StatCard
          title="Tamamlanan"
          value={completedProjects}
          description="İşlemi biten projeler"
          icon={CheckCircle2}
        />
        <StatCard
          title="Yarım / Devam Eden"
          value={unfinishedProjects}
          description="Taslak, analiz veya işlem aşamasında"
          icon={Clock3}
        />
        <StatCard
          title="Hatalı"
          value={errorProjects}
          description="Kontrol edilmesi gereken projeler"
          icon={AlertTriangle}
        />
      </div>

      {isLoading && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Projeler yükleniyor…
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="p-6 text-sm text-red-600">
            API&apos;ye bağlanılamadı: {(error as Error).message}
            <div className="mt-2 text-xs text-muted-foreground">
              Backend çalışıyor mu? Render servis URL&apos;i ve env değişkenlerini kontrol et.
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && projects.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center">
            <h2 className="text-lg font-semibold text-slate-950">
              Henüz proje yok
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              İlk dizin çeviri projenizi oluşturmak için Yeni Proje butonuna tıklayın.
            </p>
            <Link href="/projects/new" className="mt-5 inline-flex">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Yeni Proje Oluştur
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && projects.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">
                Proje Listesi
              </h2>
              <p className="text-sm text-muted-foreground">
                Projeleri kart görünümünde açabilir veya silebilirsin.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => {
              const status = (project.status ?? "draft") as ProjectStatus;
              const label = STATUS_LABEL[status] ?? STATUS_LABEL.draft;

              return (
                <Card
                  key={project.id}
                  className="group flex min-h-[190px] flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/projects/${project.id}`} className="min-w-0 flex-1">
                        <CardTitle className="line-clamp-2 text-lg transition group-hover:text-slate-700">
                          {project.title}
                        </CardTitle>
                      </Link>

                      <Badge variant={label.variant}>{label.text}</Badge>
                    </div>

                    <CardDescription>
                      Oluşturulma tarihi:{" "}
                      {new Date(project.created_at).toLocaleString("tr-TR")}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="mt-auto flex items-center justify-between gap-2">
                    <Link href={`/projects/${project.id}`}>
                      <Button variant="outline" size="sm">
                        Aç
                      </Button>
                    </Link>

                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (confirm(`"${project.title}" projesi silinsin mi?`)) {
                          deleteMutation.mutate(project.id);
                        }
                      }}
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Sil
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
