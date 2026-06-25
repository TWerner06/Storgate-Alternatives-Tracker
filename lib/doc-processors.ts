// lib/doc-processors.ts
// Text extraction from PDFs, DOCX, and other documents

import pdfParse from 'pdf-parse'

/**
 * Extract text from PDF file
 */
export async function extractPdfText(
  fileBuffer: ArrayBuffer
): Promise<{ text: string; pages: number }> {
  try {
    const buffer = Buffer.from(fileBuffer)
    const pdf = await pdfParse(buffer)
    
    return {
      text: pdf.text,
      pages: pdf.numpages || 0
    }
  } catch (error) {
    console.error('PDF extraction error:', error)
    throw new Error(`Failed to extract PDF text: ${(error as Error).message}`)
  }
}

/**
 * Extract text from DOCX file
 */
export async function extractDocxText(fileBuffer: ArrayBuffer): Promise<string> {
  try {
    // For now, return error — DOCX extraction requires additional dependencies
    // In production, use: import { Document } from 'docx'
    throw new Error('DOCX extraction requires additional setup')
  } catch (error) {
    console.error('DOCX extraction error:', error)
    throw new Error(`Failed to extract DOCX text: ${(error as Error).message}`)
  }
}

/**
 * Smart document processor — determines format and extracts appropriately
 */
export async function extractDocumentText(
  fileBuffer: ArrayBuffer,
  fileName: string
): Promise<{ text: string; format: string; metadata: Record<string, unknown> }> {
  const ext = fileName.split('.').pop()?.toLowerCase()
  
  switch (ext) {
    case 'pdf':
      const { text: pdfText, pages } = await extractPdfText(fileBuffer)
      return {
        text: pdfText,
        format: 'pdf',
        metadata: { pages }
      }
      
    case 'docx':
    case 'doc':
      const docxText = await extractDocxText(fileBuffer)
      return {
        text: docxText,
        format: 'docx',
        metadata: {}
      }
      
    case 'txt':
      const text = new TextDecoder().decode(fileBuffer)
      return {
        text,
        format: 'txt',
        metadata: {}
      }
      
    default:
      // Try as plain text
      try {
        const text = new TextDecoder().decode(fileBuffer)
        return {
          text,
          format: 'text',
          metadata: {}
        }
      } catch {
        throw new Error(`Unsupported file format: ${ext}`)
      }
  }
}

/**
 * Clean and normalize extracted text for better Claude processing
 */
export function cleanTextForExtraction(text: string): string {
  // Remove excessive whitespace
  let cleaned = text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\t+/g, ' ')
  
  // Remove common OCR artifacts and control characters
  cleaned = cleaned
    .replace(/\f/g, '')
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, '')
  
  // Remove page break indicators
  cleaned = cleaned
    .replace(/^Page \d+.*$/gm, '')
    .replace(/^---.*---$/gm, '')
  
  return cleaned.trim()
}

/**
 * Chunk text for processing if needed
 */
export function chunkDocumentText(
  text: string,
  maxChunkSize: number = 50000
): string[] {
  if (text.length <= maxChunkSize) {
    return [text]
  }
  
  const chunks: string[] = []
  let currentChunk = ''
  
  // Try to split on double newlines (section breaks) first
  const sections = text.split('\n\n')
  
  for (const section of sections) {
    if ((currentChunk + section).length > maxChunkSize && currentChunk) {
      chunks.push(currentChunk)
      currentChunk = section
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + section
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk)
  }
  
  return chunks
}

/**
 * Estimate token count for text
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
