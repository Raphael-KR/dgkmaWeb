import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertObituarySchema, type InsertObituary } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Wand2, ArrowLeft, Check } from "lucide-react";

export default function ObituaryCreate() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isParsing, setIsParsing] = useState(false);
    const [parseInput, setParseInput] = useState("");

    const form = useForm<InsertObituary>({
        resolver: zodResolver(insertObituarySchema),
        defaultValues: {
            title: "",
            deceasedName: "",
            deceasedRelation: "본인",
            dateOfDeath: "",
            funeralHome: "",
            jangji: "",
            bankAccount: "",
            chiefMourner: "",
            contactNumber: "",
        },
    });

    // AI 파싱 Mutation
    const parseMutation = useMutation({
        mutationFn: async (text: string) => {
            const res = await apiRequest("POST", "/api/obituary/parse", { text });
            return res.json();
        },
        onSuccess: (data) => {
            toast({
                title: "부고 내용 분석 완료",
                description: "내용이 자동으로 입력되었습니다. 확인 후 수정해주세요.",
            });

            // 폼 값 업데이트
            form.reset({
                title: `${data.deceasedName} 별세`,
                deceasedName: data.deceasedName || "",
                deceasedRelation: data.deceasedRelation || "본인",
                dateOfDeath: data.dateOfDeath || "",
                funeralHome: data.funeralHome || "",
                jangji: data.jangji || "",
                bankAccount: data.bankAccount || "",
                chiefMourner: data.chiefMourner || "",
                contactNumber: data.contactNumber || "",
            });
        },
        onError: () => {
            toast({
                title: "분석 실패",
                description: "부고 내용을 분석하지 못했습니다. 직접 입력해주세요.",
                variant: "destructive",
            });
        },
        onSettled: () => {
            setIsParsing(false);
        }
    });

    const handleParse = () => {
        if (!parseInput.trim()) {
            toast({
                title: "내용을 입력해주세요",
                description: "분석할 부고 문자나 링크를 입력해주세요.",
                variant: "destructive",
            });
            return;
        }
        setIsParsing(true);
        parseMutation.mutate(parseInput);
    };

    // 부고 생성 Mutation
    const createMutation = useMutation({
        mutationFn: async (data: InsertObituary) => {
            const res = await apiRequest("POST", "/api/obituaries", data);
            return res.json();
        },
        onSuccess: () => {
            toast({
                title: "부고 등록 완료",
                description: "부고가 성공적으로 등록되었습니다.",
            });
            queryClient.invalidateQueries({ queryKey: ["/api/obituaries"] });
            setLocation("/o");
        },
        onError: (error) => {
            toast({
                title: "등록 실패",
                description: "부고 등록 중 오류가 발생했습니다.",
                variant: "destructive",
            });
        }
    });

    const onSubmit = (data: InsertObituary) => {
        createMutation.mutate(data);
    };

    return (
        <div className="min-h-screen bg-kakao-gray pb-20">
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-md mx-auto px-4 h-14 flex items-center">
                    <Button variant="ghost" size="icon" onClick={() => setLocation("/o")}>
                        <ArrowLeft size={24} />
                    </Button>
                    <h1 className="text-lg font-bold ml-2">부고 알리기</h1>
                </div>
            </div>

            <div className="max-w-md mx-auto px-4 py-6 space-y-6">
                {/* AI 파싱 섹션 */}
                <Card className="border-2 border-kakao-yellow/50">
                    <CardHeader className="bg-yellow-50/50 pb-3">
                        <CardTitle className="text-base font-bold flex items-center text-kakao-brown">
                            <Wand2 size={18} className="mr-2" />
                            AI 자동 입력
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-3">
                        <p className="text-sm text-gray-600">
                            받으신 부고 문자나 링크를 붙여넣으시면 자동으로 내용을 입력해드립니다.
                        </p>
                        <Textarea
                            placeholder="부고 문자 전체를 여기에 붙여넣으세요..."
                            className="min-h-[100px] resize-none"
                            value={parseInput}
                            onChange={(e) => setParseInput(e.target.value)}
                        />
                        <Button
                            className="w-full bg-kakao-yellow text-kakao-brown hover:bg-yellow-400"
                            onClick={handleParse}
                            disabled={isParsing}
                        >
                            {isParsing ? (
                                <>
                                    <LoadingSpinner className="mr-2 h-4 w-4" />
                                    분석 중...
                                </>
                            ) : (
                                "내용 분석하여 자동 입력하기"
                            )}
                        </Button>
                    </CardContent>
                </Card>

                {/* 입력 폼 */}
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <Card>
                            <CardContent className="pt-6 space-y-4">
                                <FormField
                                    control={form.control}
                                    name="title"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>제목</FormLabel>
                                            <FormControl>
                                                <Input placeholder="예: 12기 홍길동 부친상" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="deceasedName"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>고인 성함</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="고인 성함" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="deceasedRelation"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>관계</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="예: 부친, 모친, 장인" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <FormField
                                    control={form.control}
                                    name="dateOfDeath"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>별세 일시</FormLabel>
                                            <FormControl>
                                                <Input placeholder="예: 2024년 5월 20일 오전 10시" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="funeralHome"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>빈소</FormLabel>
                                            <FormControl>
                                                <Input placeholder="장례식장 이름 및 호실" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="jangji"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>장지 (선택)</FormLabel>
                                            <FormControl>
                                                <Input placeholder="장지 주소" {...field} value={field.value || ''} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="chiefMourner"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>상주</FormLabel>
                                            <FormControl>
                                                <Input placeholder="상주 성함" {...field} value={field.value || ''} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="bankAccount"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>마음 전하실 곳 (계좌)</FormLabel>
                                            <FormControl>
                                                <Input placeholder="은행 계좌번호 예금주" {...field} value={field.value || ''} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </CardContent>
                        </Card>

                        <div className="pt-4">
                            <Button
                                type="submit"
                                className="w-full bg-gray-900 text-white hover:bg-gray-800 h-12 text-lg"
                                disabled={createMutation.isPending}
                            >
                                {createMutation.isPending ? (
                                    <LoadingSpinner className="mr-2" />
                                ) : (
                                    <Check className="mr-2" />
                                )}
                                부고 등록하기
                            </Button>
                        </div>
                    </form>
                </Form>
            </div>
        </div>
    );
}
