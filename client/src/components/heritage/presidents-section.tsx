import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function PresidentsSection() {
    const presidents = [
        {
            generation: "제20대",
            name: "김한의",
            term: "2023.03 ~ 현재",
            slogan: "소통하는 동문회, 함께하는 미래",
            image: null
        },
        {
            generation: "제19대",
            name: "이동국",
            term: "2021.03 ~ 2023.02",
            slogan: "다시 뛰는 동국한의",
            image: null
        },
        {
            generation: "제18대",
            name: "박동문",
            term: "2019.03 ~ 2021.02",
            slogan: "화합과 상생의 동문회",
            image: null
        },
        {
            generation: "제17대",
            name: "최경주",
            term: "2017.03 ~ 2019.02",
            slogan: "전통을 잇고 미래를 여는 동문회",
            image: null
        },
        {
            generation: "제16대",
            name: "정일산",
            term: "2015.03 ~ 2017.02",
            slogan: "동문과 함께 성장하는 동문회",
            image: null
        }
    ];

    return (
        <div className="space-y-6">
            <Card className="border-2 border-kakao-yellow">
                <CardHeader className="bg-kakao-yellow">
                    <CardTitle className="text-2xl font-bold text-kakao-brown text-center">
                        역대 동문회장
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                    <p className="text-gray-700 text-center mb-8">
                        동국대학교한의과대학동문회의 발전을 위해 헌신하신 역대 회장님들을 소개합니다.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {presidents.map((president, index) => (
                            <Card key={index} className="border border-gray-200 hover:shadow-lg transition-shadow overflow-hidden">
                                <div className="flex flex-row">
                                    <div className="w-1/3 bg-gray-100 flex items-center justify-center p-4">
                                        <Avatar className="w-20 h-20 border-2 border-white shadow-md">
                                            <AvatarFallback className="bg-kakao-brown text-white font-bold text-xl">
                                                {president.name[0]}
                                            </AvatarFallback>
                                        </Avatar>
                                    </div>
                                    <div className="w-2/3 p-4 flex flex-col justify-center">
                                        <div className="text-sm text-kakao-brown font-semibold mb-1">
                                            {president.generation}
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-900 mb-1">
                                            {president.name} 회장
                                        </h3>
                                        <p className="text-sm text-gray-500 mb-2">
                                            임기: {president.term}
                                        </p>
                                        <p className="text-sm text-gray-700 italic">
                                            "{president.slogan}"
                                        </p>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
