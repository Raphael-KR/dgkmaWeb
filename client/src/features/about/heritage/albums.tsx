import { Link, useSearch } from "wouter";
import {
  albums,
  formatHeritageDate,
  groupHeritageByYear,
  heritageYear,
  photos,
} from "@shared/heritage/content";
import { HERITAGE_PAGES, heritageAlbumHref } from "@shared/heritage/navigation";
import type { HeritageAlbum } from "@shared/heritage/types";
import { Card, CardContent } from "@/components/ui/card";
import { HeritageEmpty, HeritagePage } from "./heritage-page";
import { PhotoViewer } from "./photo-viewer";

function albumListHref(year: string) {
  return year === "recent"
    ? HERITAGE_PAGES.albums.path
    : `${HERITAGE_PAGES.albums.path}?${new URLSearchParams({ year })}`;
}

function AlbumDetail({ album, year }: { album: HeritageAlbum; year: string }) {
  const albumPhotos = album.photoIds.flatMap((id) => photos.filter((photo) => photo.id === id));
  return (
    <section aria-labelledby="album-title">
      <Link href={albumListHref(year)} className="heritage-text-link">
        사진첩 목록으로
      </Link>
      <h2 id="album-title" className="mt-5 text-xl font-bold sm:text-2xl">
        {album.title}
      </h2>
      <p className="heritage-meta mt-2">
        <time dateTime={album.date}>{formatHeritageDate(album.date)}</time> · 사진{" "}
        {albumPhotos.length}장
      </p>
      {album.description && <p className="heritage-description">{album.description}</p>}
      <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {albumPhotos.map((photo) => (
          <li key={photo.id}>
            <PhotoViewer photo={photo} albumTitle={album.title} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function AlbumCard({ album, year }: { album: HeritageAlbum; year: string }) {
  const cover = photos.find((photo) => photo.id === album.coverPhotoId);
  return (
    <Card className="h-full">
      <Link
        href={`${heritageAlbumHref(album.id)}&${new URLSearchParams({ year })}`}
        className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CardContent className="p-4">
          {cover && (
            <img
              src={cover.src}
              alt={cover.caption}
              loading="lazy"
              decoding="async"
              className="heritage-album-cover"
            />
          )}
          <h3 className="public-card-title mt-3">{album.title}</h3>
          <p className="heritage-meta mt-1">
            <time dateTime={album.date}>{formatHeritageDate(album.date)}</time> ·{" "}
            {album.photoIds.length}장
          </p>
        </CardContent>
      </Link>
    </Card>
  );
}

export default function AboutAlbums() {
  const query = new URLSearchParams(useSearch());
  const albumId = query.get("album");
  const requestedYear = query.get("year") ?? "recent";
  const year = /^(?:recent|all|\d{4})$/.test(requestedYear) ? requestedYear : "recent";
  const currentYear = Number(
    new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()),
  );
  const recentYears = Array.from({ length: 5 }, (_, index) => currentYear - index);
  const olderYears = Array.from(new Set(albums.map((album) => heritageYear(album.date))))
    .filter((value) => value < recentYears[4])
    .sort((a, b) => b - a);
  const selectedAlbum = albums.find((album) => album.id === albumId);
  const visibleAlbums = albums.filter(
    (album) =>
      year === "all" ||
      (year === "recent"
        ? recentYears.includes(heritageYear(album.date))
        : heritageYear(album.date) === Number(year)),
  );

  return (
    <HeritagePage section="albums">
      {albumId ? (
        selectedAlbum ? (
          <AlbumDetail album={selectedAlbum} year={year} />
        ) : (
          <HeritageEmpty>
            <p>해당 앨범을 찾을 수 없습니다.</p>
            <Link href={albumListHref(year)} className="heritage-text-link mt-3 inline-block">
              사진첩 목록으로
            </Link>
          </HeritageEmpty>
        )
      ) : (
        <>
          <nav aria-label="사진첩 연도 선택" className="heritage-year-nav">
            {[
              { value: "recent", label: "최근 5년" },
              ...recentYears.map((value) => ({ value: String(value), label: `${value}년` })),
              { value: "all", label: "전체" },
            ].map((option) => (
              <Link
                key={option.value}
                href={albumListHref(option.value)}
                className="heritage-year-link"
                aria-current={year === option.value ? "true" : undefined}
              >
                {option.label}
              </Link>
            ))}
          </nav>
          {olderYears.length > 0 && (
            <details
              className="mb-6"
              open={year !== "recent" && year !== "all" && Number(year) < recentYears[4]}
            >
              <summary className="heritage-text-link cursor-pointer">이전 연도</summary>
              <nav aria-label="이전 연도 사진첩" className="mt-3 flex flex-wrap gap-2">
                {olderYears.map((value) => (
                  <Link
                    key={value}
                    href={albumListHref(String(value))}
                    className="heritage-year-link"
                    aria-current={year === String(value) ? "true" : undefined}
                  >
                    {value}년
                  </Link>
                ))}
              </nav>
            </details>
          )}
          {!visibleAlbums.length ? (
            <HeritageEmpty>
              {!albums.length
                ? "등록된 사진첩이 없습니다."
                : "선택한 기간에 등록된 사진첩이 없습니다."}
            </HeritageEmpty>
          ) : (
            <div className="space-y-10">
              {groupHeritageByYear(visibleAlbums)
                .reverse()
                .map(([albumYear, entries]) => (
                  <section key={albumYear} aria-labelledby={`album-year-${albumYear}`}>
                    <h2 id={`album-year-${albumYear}`} className="public-section-title">
                      {albumYear}년
                    </h2>
                    <ul className="public-card-grid">
                      {[...entries].reverse().map((album) => (
                        <li key={album.id}>
                          <AlbumCard album={album} year={year} />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
            </div>
          )}
        </>
      )}
    </HeritagePage>
  );
}
