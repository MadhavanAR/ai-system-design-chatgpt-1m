# Capacity Planning: Designing a ChatGPT-like AI Platform for 1M Users

## Executive Overview
This engineering document provides the full mathematical back-of-the-envelope capacity calculations, infrastructure sizing, GPU cluster demands, storage trajectories, and financial models required to operate a ChatGPT-like conversational platform for **1,000,000 registered users**.

> [!NOTE]
> All formulas and numbers are explicit engineering assumptions based on real-world conversational AI usage distributions (e.g., Llama-3, vLLM, PostgreSQL 16, and Redis 7 Cluster).

---

## 1. Foundational User & Workload Assumptions

| Parameter | Baseline Value | Engineering Rationale |
| :--- | :--- | :--- |
| **Total Registered Users** | **1,000,000** | Total user accounts in system database |
| **Daily Active Users (DAU)** | **100,000 (10%)** | Standard consumer/B2B SaaS active ratio |
| **Monthly Active Users (MAU)** | **400,000 (40%)** | Monthly recurring engagement |
| **Peak Concurrent Users (PCU)** | **10,000 (10% of DAU)** | Peak hour user activity clustering |
| **Average Turns per Active User / Day** | **15 turns/day** | Average user interaction volume |
| **Average Input Tokens per Turn** | **250 tokens** | System prompt + recent history + query |
| **Average Output Tokens per Turn** | **350 tokens** | Assistant generated response |
| **Total Tokens per Turn** | **600 tokens** | 250 input + 350 output |
| **Peak-to-Average Traffic Multiplier** | **3.0x** | Traffic surge during business/evening hours |

---

## 2. Traffic & Request Throughput Calculations

### Daily Request Volume
$$\text{Daily Total Requests} = \text{DAU} \times \text{Turns/User} = 100{,}000 \times 15 = 1{,}500{,}000 \text{ requests/day}$$

### Average Requests Per Second (RPS)
$$\text{Average RPS} = \frac{1{,}500{,}000 \text{ requests}}{86{,}400 \text{ seconds}} \approx 17.36 \text{ RPS}$$

### Peak Requests Per Second (RPS)
$$\text{Peak RPS} = \text{Average RPS} \times 3.0 \approx 52.1 \text{ RPS}$$

### Peak Instantaneous Active Streams
If $10{,}000$ concurrent users make 1 request every 2 minutes (120s), and each request streams for ~6 seconds:
$$\text{Concurrent Active Streams} = 10{,}000 \times \left(\frac{6\text{s}}{120\text{s}}\right) = 500 \text{ active streaming connections}$$

---

## 3. Token Throughput & Bandwidth Demands

### Daily Token Volume
$$\text{Daily Tokens} = 1{,}500{,}000 \text{ requests} \times 600 \text{ tokens} = 900{,}000{,}000 \text{ tokens/day (900M tokens/day)}$$
$$\text{Monthly Tokens} = 900\text{M} \times 30 = 27{,}000{,}000{,}000 \text{ tokens/month (27 Billion tokens/month)}$$

### Peak Generation Throughput (Output Tokens / Sec)
$$\text{Peak Output TPS} = \text{Peak RPS} \times \text{Avg Output Tokens} = 52.1 \times 350 \approx 18{,}235 \text{ tokens/sec}$$

### Network Bandwidth Sizing
- Average UTF-8 token size $\approx 4\text{ bytes}$
- Peak Outbound Stream Bandwidth:
  $$\text{Bandwidth} = 18{,}235 \text{ tokens/s} \times 4 \text{ bytes} = 72.94 \text{ MB/s} \approx 583.5 \text{ Mbps}$$
- Recommended Ingress/Egress Edge: **10 Gbps redundant uplink**.

---

## 4. GPU Demand & Inference Cluster Sizing

To serve 18,235 output tokens/sec at peak across our 3-tier routing architecture:

```text
               Total Peak Traffic (18,235 TPS)
                             |
         +-------------------+-------------------+
         | (60%)             | (35%)             | (5%)
         v                   v                   v
   Fast Tier (8B)     Standard Tier (70B)  Reasoning Tier (Deep)
   10,941 TPS          6,382 TPS            912 TPS
```

### 1. Fast Tier: 8B Parameter Models (vLLM / FP8)
- Model: Llama-3-8B-Instruct (FP8 / AWQ quantization)
- Single NVIDIA H100 SXM5 (80GB) capacity with continuous batching: **~2,200 tokens/sec**
- Required GPUs:
  $$\text{GPUs} = \frac{10{,}941 \text{ TPS}}{2{,}200 \text{ TPS/GPU}} = 4.97 \approx \mathbf{6 \times \text{H100 GPUs (N+1 redundancy)}}$$

### 2. Standard Tier: 70B Parameter Models (TensorRT-LLM / FP8)
- Model: Llama-3-70B-Instruct (Tensor Parallelism = 8 on 8x H100 Node)
- One 8x H100 node throughput with continuous batching: **~4,500 tokens/sec**
- Required Nodes:
  $$\text{Nodes} = \frac{6{,}382 \text{ TPS}}{4{,}500 \text{ TPS/Node}} = 1.41 \approx \mathbf{2 \times \text{8-way H100 Nodes (16 H100 GPUs)}}$$

### 3. Reasoning Tier: Deep Thinking / Long-Context
- Heavy multi-step chain-of-thought generation
- Required Nodes: **1x 8-way H100 Node (8 H100 GPUs)**

### Total GPU Fleet Required
$$\mathbf{Total\ Fleet} = 6 + 16 + 8 = \mathbf{30 \times NVIDIA\ H100\ GPUs}$$

---

## 5. Storage & Database Growth Sizing

### Relational Storage (PostgreSQL 16)
- Message Record Size: ~1.5 KB (JSON metadata, content, UUIDs, timestamps)
- Daily Table Growth:
  $$\text{Daily Growth} = 1{,}500{,}000 \text{ msgs} \times 1.5 \text{ KB} = 2.25 \text{ GB/day}$$
- Annual Table Growth:
  $$\text{Annual DB Growth} = 2.25 \text{ GB} \times 365 \approx 821 \text{ GB/year}$$
- **PostgreSQL Hardware Recommendation**:
  - Primary: 32 vCPU, 128 GB RAM, 2 TB NVMe SSD (io2 / 10,000 IOPS).
  - Read Replicas: 2x (16 vCPU, 64 GB RAM, 2 TB NVMe SSD).

### In-Memory Cache (Redis 7 Cluster)
- Active Sessions: 10,000 concurrent sessions $\times$ 50 KB active history buffer = **500 MB**
- Sliding Window Rate Limit Keys: 100,000 active daily users $\times$ 1 KB = **100 MB**
- Prefix / KV Lookup Index: ~20 GB
- **Redis Hardware Recommendation**: 3-node Redis cluster, 32 GB RAM per node (96 GB total).

---

## 6. Monthly Cost Breakdown: Self-Hosted GPU vs API Blend

| Expense Category | Self-Hosted GPU Cloud (vLLM / Kubernetes) | Managed API Blend (OpenAI / Anthropic) |
| :--- | :--- | :--- |
| **GPU Compute (30x H100 @ ~$2.80/hr)** | ~$60,480 / month | - |
| **Managed Model API Tokens (27B tok)** | - | ~$28,500 / month (with 8B/70B routing) |
| **API Gateway & App Nodes (EKS / ECS)** | ~$2,400 / month | ~$2,400 / month |
| **Managed PostgreSQL (RDS Multi-AZ + 2 Replicas)** | ~$1,800 / month | ~$1,800 / month |
| **Managed Redis Cluster (ElastiCache 3-Node)** | ~$600 / month | ~$600 / month |
| **Data Transfer & Cloudflare CDN** | ~$800 / month | ~$800 / month |
| **Total Projected Monthly Cost** | **~$66,080 / month** | **~$34,100 / month** |
| **Cost Per Daily Active User (DAU)** | **$0.66 / DAU / month** | **$0.34 / DAU / month** |

### Strategic Takeaway
At **1M registered users (100K DAU)**, utilizing a **Tiered API Blend (Fast 8B + Standard 70B)** is ~48% more cost-efficient than running a 24/7 dedicated 30x H100 GPU cluster, because consumer chat workloads exhibit diurnal valleys where self-hosted GPUs sit idle. As the user base approaches **5M–10M users**, high base utilization flips the economics in favor of dedicated GPU clusters.
