import React from 'react'
import { createRoot } from 'react-dom/client'
import '../../../packages/marca/base.css'
import './estilos/catalogo.css'
import Catalogo from './Catalogo.jsx'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Catalogo />
  </React.StrictMode>,
)
