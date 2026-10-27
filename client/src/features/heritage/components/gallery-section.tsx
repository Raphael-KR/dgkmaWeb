import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Image as ImageIcon } from "lucide-react";

export function GallerySection() {
    // Mock data for gallery albums
    const albums = [
        {
            id: 1,
            title: "2023 정기총회 및 송년의 밤",
            date: "2023.12.15",
            count: 45,
            coverImage: null
        },
        {
            id: 2,
            title: "제15회 동국한의 학술대회",
            date: "2023.10.08",
            count: 32,
            coverImage: null
        },
        {
            id: 3,
            title: "2023 홈커밍데이",
            date: "2023.05.20",
            count: 128,
            coverImage: null
        },
        {
            id: 4,
            title: "2022 정기총회",
            date: "2022.12.10",
            count: 56,
            coverImage: null
        }
    ];

    return (
        <div className="space-y-6">
            <Card className="border-2 border-kakao-yellow">
                <CardHeader className="bg-kakao-yellow">
                    <CardTitle className="text-2xl font-bold text-kakao-brown text-center">
                        사진으로 보는 동문회 역사
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                    <Tabs defaultValue="recent" className="w-full">
                        <TabsList className="grid w-full grid-cols-3 mb-6">
                            <TabsTrigger value="recent">최근 활동</TabsTrigger>
                            <TabsTrigger value="history">역사 자료</TabsTrigger>
                            <TabsTrigger value="events">주요 행사</TabsTrigger>
                        </TabsList>

                        <TabsContent value="recent" className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {albums.map((album) => (
                                    <Card key={album.id} className="cursor-pointer hover:shadow-lg transition-all group">
                                        <div className="aspect-video bg-gray-200 relative overflow-hidden rounded-t-lg">
                                            <div className="absolute inset-0 flex items-center justify-center text-gray-400 group-hover:scale-105 transition-transform duration-300">
                                                <ImageIcon size={48} />
                                            </div>
                                            <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                                                +{album.count}장
                                            </div>
                                        </div>
                                        <CardContent className="p-4">
                                            <h3 className="font-bold text-gray-900 mb-1 group-hover:text-kakao-brown transition-colors">
                                                {album.title}
                                            </h3>
                                            <p className="text-sm text-gray-500">{album.date}</p>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </TabsContent>

                        <TabsContent value="history">
                            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                                <ImageIcon size={48} className="mb-4 opacity-50" />
                                <p>준비 중인 갤러리입니다.</p>
                                <p className="text-sm mt-2">과거 사진 자료를 디지털화하고 있습니다.</p>
                            </div>
                        </TabsContent>

                        <TabsContent value="events">
                            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                                <ImageIcon size={48} className="mb-4 opacity-50" />
                                <p>준비 중인 갤러리입니다.</p>
                            </div>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
}
