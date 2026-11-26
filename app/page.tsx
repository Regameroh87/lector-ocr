import { MODELOS, modeloPorDefecto } from "@/lib/models";
import App from "./ui/App";

export default function Home() {
  return <App modelos={MODELOS} modeloInicial={modeloPorDefecto()} />;
}
