import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Props = {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
};

export function QueryError({ message, onRetry, retrying = false }: Props) {
  return (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3"
        disabled={retrying}
        onClick={onRetry}
      >
        {retrying ? "다시 확인 중…" : "다시 불러오기"}
      </Button>
    </Alert>
  );
}
