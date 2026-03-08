import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("pt-BR");
}

/**
 * Converte um arquivo de imagem para base64
 * @param file Arquivo de imagem
 * @param maxSizeKB Tamanho máximo em KB (padrão: 500KB)
 * @returns Promise com string base64 (data:image/...;base64,...)
 */
export function imageToBase64(file: File, maxSizeKB: number = 500): Promise<string> {
  return new Promise((resolve, reject) => {
    // Verificar tipo de arquivo
    if (!file.type.startsWith('image/')) {
      reject(new Error('O arquivo deve ser uma imagem'));
      return;
    }

    // Verificar tamanho
    const fileSizeKB = file.size / 1024;
    if (fileSizeKB > maxSizeKB) {
      reject(new Error(`A imagem deve ter no máximo ${maxSizeKB}KB. Tamanho atual: ${Math.round(fileSizeKB)}KB`));
      return;
    }

    const reader = new FileReader();
    
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result);
    };
    
    reader.onerror = () => {
      reject(new Error('Erro ao ler o arquivo'));
    };
    
    reader.readAsDataURL(file);
  });
}
