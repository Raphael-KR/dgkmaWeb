import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import type { Post, Category, UpdatePost } from "@shared/contracts";
import { isNoticeCategory, isSelectablePostCategory } from "@shared/category-policy";
import { useAuth } from "@/features/auth";
import { NoticeEditor } from "@/features/events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useUpload } from "@/hooks/use-upload";
import { useSeo } from "@/lib/seo";
import { postRequest, refreshPosts } from "@/lib/post-management";

const PostBodyEditor = lazy(() => import("@/components/post-body-editor").then(module => ({ default: module.PostBodyEditor })));

export default function PostEdit() {
  const [, params] = useRoute("/p/:id/edit");
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { data: post, isLoading, error } = useQuery<Post>({
    queryKey: ["/api/posts", params?.id], enabled: !!user && !!params?.id,
    queryFn: () => postRequest("GET", `/api/posts/${params!.id}`),
  });
  useSeo({ title: "게시글 수정", description: "작성한 게시글 수정", noIndex: true, path: `/p/${params?.id}/edit` });
  const saved = async () => { await refreshPosts(); navigate(`/p/${post!.id}`); };
  if (isLoading) return <div className="member-container"><LoadingSpinner /></div>;
  if (error || !post || post.authorId !== user?.id) return <div className="member-container space-y-4"><p role="alert">작성한 게시글만 수정할 수 있습니다.</p><Button onClick={() => navigate("/b")}>게시판으로</Button></div>;
  return <div className="member-container space-y-5">
    <h1 className="text-2xl font-bold">게시글 수정</h1>
    {post.isHidden && <p role="status" className="rounded-lg bg-amber-50 p-4 text-sm">관리자가 가린 글입니다. 수정해도 가린 상태는 유지됩니다.</p>}
    <Suspense fallback={<LoadingSpinner />}>
      {post.eventType ? <NoticeEditor key={`${post.id}:${post.revision}`} post={post} onSaved={saved} />
        : <Editor key={`${post.id}:${post.revision}`} post={post} onSaved={saved} />}
    </Suspense>
  </div>;
}

function Editor({ post, onSaved }: { post: Post; onSaved: () => Promise<void> }) {
  const [, navigate] = useLocation();
  const [title, setTitle] = useState(post.title);
  const [content, setContent] = useState(post.content);
  const [categoryId, setCategoryId] = useState(post.categoryId);
  const [imageUrls, setImageUrls] = useState(post.imageUrls ?? []);
  const [valid, setValid] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { data: categories = [] } = useQuery<Category[]>({ queryKey: ["/api/categories"] });
  const { uploadFile, isUploading } = useUpload({ onError: cause => setError(cause.message) });
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const cancel = () => { if (!dirty || window.confirm("수정 내용을 저장하지 않고 돌아갈까요?")) navigate(`/p/${post.id}`); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || isUploading || !valid || !categoryId) return;
    setBusy(true); setError("");
    try {
      const data: UpdatePost = { revision: post.revision, title, content, categoryId, imageUrls };
      await postRequest("PATCH", `/api/posts/${post.id}`, data);
      setDirty(false);
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "저장하지 못했습니다."); }
    finally { setBusy(false); }
  };
  return <form onSubmit={save} className="space-y-5 rounded-xl border bg-white p-4 md:p-6">
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <fieldset disabled={busy || isUploading} className="space-y-5">
      <label className="block space-y-2"><span>카테고리</span><select className="block w-full rounded-md border p-2" value={categoryId ?? ""} required onChange={event => { setCategoryId(Number(event.target.value)); setDirty(true); }}>
        <option value="" disabled>카테고리 선택</option>
        {categories.filter(category => isSelectablePostCategory(category) && !isNoticeCategory(category.name)).map(category => <option key={category.id} value={category.id}>{category.displayName}</option>)}
      </select></label>
      <label className="block space-y-2"><span>제목</span><Input required maxLength={300} value={title} onChange={event => { setTitle(event.target.value); setDirty(true); }} /></label>
      <div className="space-y-2"><p>본문</p><Suspense fallback={<LoadingSpinner />}><PostBodyEditor value={content} disabled={busy || isUploading} onChange={value => { setContent(value); setDirty(true); }} onValidityChange={value => { setValid(value); if (!value) setDirty(true); }} /></Suspense></div>
      <label className="block space-y-2"><span>첨부 이미지</span><Input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={async event => {
        const files = Array.from(event.target.files ?? []); event.target.value = "";
        if (files.length + imageUrls.length > 20) { setError("이미지는 20개까지 첨부할 수 있습니다."); return; }
        for (const file of files) { const result = await uploadFile(file); if (result) { setImageUrls(current => [...current, result.objectPath]); setDirty(true); } }
      }} /></label>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{imageUrls.map(path => <div key={path} className="space-y-2"><img src={path} alt="첨부 이미지" className="h-32 w-full rounded-md object-cover" /><Button type="button" variant="outline" size="sm" onClick={() => { setImageUrls(current => current.filter(value => value !== path)); setDirty(true); }}>첨부 해제</Button></div>)}</div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={cancel}>취소</Button><Button type="submit" disabled={!valid || !title.trim() || !categoryId}>{busy ? "저장 중…" : "수정 저장"}</Button></div>
    </fieldset>
  </form>;
}
