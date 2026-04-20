import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Plus, Calendar, MapPin, Phone, User } from "lucide-react";
import { type Obituary } from "@shared/schema";

export default function ObituaryList() {
    const [, setLocation] = useLocation();

    const { data: obituaries, isLoading } = useQuery<Obituary[]>({
        queryKey: ["/api/obituaries"],
    });

    return (
        <div className="min-h-screen bg-kakao-gray pb-20">
            <div className="bg-gray-900 text-white py-8 px-4 mb-6">
                <div className="max-w-md mx-auto text-center">
                    <h1 className="text-2xl font-bold mb-2">부고 알림</h1>
                    <p className="text-gray-400 text-sm">동문들의 슬픔을 함께 나눕니다.</p>
                </div>
            </div>

            <div className="max-w-md mx-auto px-4">
                <div className="flex justify-end mb-4">
                    <Button
                        onClick={() => setLocation("/o/new")}
                        className="bg-gray-900 text-white hover:bg-gray-800"
                    >
                        <Plus size={16} className="mr-1" />
                        부고 알리기
                    </Button>
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <LoadingSpinner />
                    </div>
                ) : obituaries?.length === 0 ? (
                    <Card>
                        <CardContent className="p-8 text-center text-gray-500">
                            등록된 부고가 없습니다.
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-4">
                        {obituaries?.map((obituary) => (
                            <Card key={obituary.id} className="overflow-hidden border-l-4 border-l-gray-900">
                                <CardHeader className="bg-white pb-2">
                                    <div className="flex justify-between items-start">
                                        <Badge variant="outline" className="mb-2">
                                            {obituary.deceasedRelation}
                                        </Badge>
                                        <span className="text-xs text-gray-500">
                                            {new Date(obituary.createdAt!).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <CardTitle className="text-lg font-bold text-gray-900">
                                        {obituary.title}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-2 space-y-3">
                                    <div className="flex items-center text-sm text-gray-700">
                                        <User size={16} className="mr-2 text-gray-400" />
                                        <span className="font-medium mr-2">고인:</span>
                                        {obituary.deceasedName}
                                    </div>

                                    <div className="flex items-center text-sm text-gray-700">
                                        <Calendar size={16} className="mr-2 text-gray-400" />
                                        <span className="font-medium mr-2">별세:</span>
                                        {obituary.dateOfDeath}
                                    </div>

                                    <div className="flex items-start text-sm text-gray-700">
                                        <MapPin size={16} className="mr-2 text-gray-400 mt-0.5" />
                                        <div>
                                            <span className="font-medium mr-2">빈소:</span>
                                            {obituary.funeralHome}
                                        </div>
                                    </div>

                                    {obituary.jangji && (
                                        <div className="flex items-start text-sm text-gray-700">
                                            <MapPin size={16} className="mr-2 text-gray-400 mt-0.5" />
                                            <div>
                                                <span className="font-medium mr-2">장지:</span>
                                                {obituary.jangji}
                                            </div>
                                        </div>
                                    )}

                                    <div className="pt-3 mt-3 border-t border-gray-100 flex justify-between items-center">
                                        <div className="text-sm">
                                            <span className="text-gray-500 mr-1">상주:</span>
                                            <span className="font-medium">{obituary.chiefMourner}</span>
                                        </div>
                                        <Button variant="outline" size="sm" className="text-xs">
                                            자세히 보기
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
