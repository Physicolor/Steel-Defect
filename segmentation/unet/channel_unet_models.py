"""
Channel-UNet 模型定义
参考原始训练代码实现,确保与训练权重完全匹配
"""
import torch
import torch.nn as nn


class GAU(nn.Module):
    """Global Attention Upsample 模块"""
    def __init__(self, channels_high, channels_low, upsample=True):
        super(GAU, self).__init__()
        self.upsample = upsample
        self.conv3x3 = nn.Conv2d(channels_low, channels_low, kernel_size=3, padding=1, bias=False)
        self.bn_low = nn.BatchNorm2d(channels_low)
        
        self.conv1x1 = nn.Conv2d(channels_high, channels_low, kernel_size=1, padding=0, bias=False)
        self.bn_high = nn.BatchNorm2d(channels_low)
        
        if upsample:
            self.conv_upsample = nn.ConvTranspose2d(channels_high, channels_low, kernel_size=4, stride=2, padding=1, bias=False)
            self.bn_upsample = nn.BatchNorm2d(channels_low)
        else:
            self.conv_reduction = nn.Conv2d(channels_high, channels_low, kernel_size=1, padding=0, bias=False)
            self.bn_reduction = nn.BatchNorm2d(channels_low)
        self.relu = nn.ReLU(inplace=True)
    
    def forward(self, fms_high, fms_low, fm_mask=None):
        b, c, h, w = fms_high.shape
        
        fms_high_gp = nn.AvgPool2d(fms_high.shape[2:])(fms_high).view(len(fms_high), c, 1, 1)
        fms_high_gp = self.conv1x1(fms_high_gp)
        fms_high_gp = self.relu(fms_high_gp)
        
        fms_low_mask = self.conv3x3(fms_low)
        fms_low_mask = self.bn_low(fms_low_mask)
        
        fms_att = fms_low_mask * fms_high_gp
        if self.upsample:
            out = self.relu(self.bn_upsample(self.conv_upsample(fms_high)) + fms_att)
        else:
            out = self.relu(self.bn_reduction(self.conv_reduction(fms_high)) + fms_att)
        return out


class DoubleConv(nn.Module):
    """双卷积层 (conv3x3 -> BN -> ReLU) * 2"""
    def __init__(self, in_ch, out_ch):
        super(DoubleConv, self).__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(in_ch, out_ch, 3, padding=1),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, 3, padding=1),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True)
        )
    
    def forward(self, input):
        return self.conv(input)


class SimpleUNet32(nn.Module):
    """
    简化版 UNet (基础通道32)
    特征:
    1. 基础通道 32
    2. Decoder 采用 2 路拼接 (Skip + Up)
    3. 无 GAU 模块
    """
    def __init__(self, in_ch=3, out_ch=1):
        super(SimpleUNet32, self).__init__()
        filter = [32, 64, 128, 256, 512]
        
        # Encoder
        self.conv1 = DoubleConv(in_ch, filter[0])
        self.pool1 = nn.MaxPool2d(2)
        
        self.conv2 = DoubleConv(filter[0], filter[1])
        self.pool2 = nn.MaxPool2d(2)
        
        self.conv3 = DoubleConv(filter[1], filter[2])
        self.pool3 = nn.MaxPool2d(2)
        
        self.conv4 = DoubleConv(filter[2], filter[3])
        self.pool4 = nn.MaxPool2d(2)
        
        self.conv5 = DoubleConv(filter[3], filter[4])
        
        # Decoder (2-way concatenation)
        self.up6 = nn.ConvTranspose2d(filter[4], filter[3], 2, stride=2)
        self.conv6 = DoubleConv(filter[3] * 2, filter[3])
        
        self.up7 = nn.ConvTranspose2d(filter[3], filter[2], 2, stride=2)
        self.conv7 = DoubleConv(filter[2] * 2, filter[2])
        
        self.up8 = nn.ConvTranspose2d(filter[2], filter[1], 2, stride=2)
        self.conv8 = DoubleConv(filter[1] * 2, filter[1])
        
        self.up9 = nn.ConvTranspose2d(filter[1], filter[0], 2, stride=2)
        self.conv9 = DoubleConv(filter[0] * 2, filter[0])
        
        self.conv10 = nn.Conv2d(filter[0], out_ch, 1)
    
    def forward(self, x):
        # Encoder
        c1 = self.conv1(x)
        p1 = self.pool1(c1)
        
        c2 = self.conv2(p1)
        p2 = self.pool2(c2)
        
        c3 = self.conv3(p2)
        p3 = self.pool3(c3)
        
        c4 = self.conv4(p3)
        p4 = self.pool4(c4)
        
        c5 = self.conv5(p4)
        
        # Decoder
        up_6 = self.up6(c5)
        merge6 = torch.cat([c4, up_6], dim=1)
        c6 = self.conv6(merge6)
        
        up_7 = self.up7(c6)
        merge7 = torch.cat([c3, up_7], dim=1)
        c7 = self.conv7(merge7)
        
        up_8 = self.up8(c7)
        merge8 = torch.cat([c2, up_8], dim=1)
        c8 = self.conv8(merge8)
        
        up_9 = self.up9(c8)
        merge9 = torch.cat([c1, up_9], dim=1)
        c9 = self.conv9(merge9)
        
        c10 = self.conv10(c9)
        out = torch.sigmoid(c10)
        return out


class ChannelUNet64(nn.Module):
    """
    Channel-UNet (基础通道64)
    特征:
    1. 基础通道 64
    2. Decoder 采用 3 路拼接 (Skip + Up + GAU)
    3. 包含 GAU 模块
    """
    def __init__(self, in_ch=3, out_ch=1):
        super(ChannelUNet64, self).__init__()
        filter = [64, 128, 256, 512, 1024]
        
        # Encoder
        self.conv1 = DoubleConv(in_ch, filter[0])
        self.pool1 = nn.MaxPool2d(2)
        
        self.conv2 = DoubleConv(filter[0], filter[1])
        self.pool2 = nn.MaxPool2d(2)
        
        self.conv3 = DoubleConv(filter[1], filter[2])
        self.pool3 = nn.MaxPool2d(2)
        
        self.conv4 = DoubleConv(filter[2], filter[3])
        self.pool4 = nn.MaxPool2d(2)
        
        self.conv5 = DoubleConv(filter[3], filter[4])
        
        # Decoder (3-way concatenation with GAU)
        self.up6 = nn.ConvTranspose2d(filter[4], filter[3], 2, stride=2)
        self.conv6 = DoubleConv(filter[3] * 3, filter[3])
        
        self.up7 = nn.ConvTranspose2d(filter[3], filter[2], 2, stride=2)
        self.conv7 = DoubleConv(filter[2] * 3, filter[2])
        
        self.up8 = nn.ConvTranspose2d(filter[2], filter[1], 2, stride=2)
        self.conv8 = DoubleConv(filter[1] * 3, filter[1])
        
        self.up9 = nn.ConvTranspose2d(filter[1], filter[0], 2, stride=2)
        self.conv9 = DoubleConv(filter[0] * 3, filter[0])
        
        self.conv10 = nn.Conv2d(filter[0], out_ch, 1)
        
        # GAU modules
        self.gau_1 = GAU(filter[4], filter[3])
        self.gau_2 = GAU(filter[3], filter[2])
        self.gau_3 = GAU(filter[2], filter[1])
        self.gau_4 = GAU(filter[1], filter[0])
    
    def forward(self, x):
        # Encoder
        c1 = self.conv1(x)
        p1 = self.pool1(c1)
        
        c2 = self.conv2(p1)
        p2 = self.pool2(c2)
        
        c3 = self.conv3(p2)
        p3 = self.pool3(c3)
        
        c4 = self.conv4(p3)
        p4 = self.pool4(c4)
        
        c5 = self.conv5(p4)
        
        # Decoder with GAU
        up_6 = self.up6(c5)
        gau1 = self.gau_1(c5, c4)
        merge6 = torch.cat([c4, up_6, gau1], dim=1)
        c6 = self.conv6(merge6)
        
        up_7 = self.up7(c6)
        gau2 = self.gau_2(gau1, c3)
        merge7 = torch.cat([c3, up_7, gau2], dim=1)
        c7 = self.conv7(merge7)
        
        up_8 = self.up8(c7)
        gau3 = self.gau_3(gau2, c2)
        merge8 = torch.cat([c2, up_8, gau3], dim=1)
        c8 = self.conv8(merge8)
        
        up_9 = self.up9(c8)
        gau4 = self.gau_4(gau3, c1)
        merge9 = torch.cat([c1, up_9, gau4], dim=1)
        c9 = self.conv9(merge9)
        
        c10 = self.conv10(c9)
        out = torch.sigmoid(c10)
        return out


def detect_unet_architecture(checkpoint):
    """
    检测 UNet 模型架构
    返回: 'simple32', 'channel64', 或 'unknown'
    """
    if isinstance(checkpoint, dict):
        if 'state_dict' in checkpoint:
            state_dict = checkpoint['state_dict']
        elif 'model_state_dict' in checkpoint:
            state_dict = checkpoint['model_state_dict']
        else:
            state_dict = checkpoint
    else:
        state_dict = checkpoint
    
    # 检查是否有 GAU 模块
    has_gau = any('gau' in key.lower() for key in state_dict.keys())
    
    # 检查第一个卷积层的输出通道数
    first_conv_keys = [k for k in state_dict.keys() if 'conv1' in k and 'weight' in k]
    if first_conv_keys:
        first_conv_weight = state_dict[first_conv_keys[0]]
        base_channels = first_conv_weight.shape[0]
    else:
        # 尝试其他可能的键名
        for key in state_dict.keys():
            if 'inc' in key or 'conv1' in key:
                weight = state_dict[key]
                if len(weight.shape) == 4:  # 卷积权重
                    base_channels = weight.shape[0]
                    break
        else:
            return 'unknown'
    
    print(f"[Detect] 模型检测结果: base_channels={base_channels}, has_gau={has_gau}")
    
    if has_gau:
        return 'channel64'
    elif base_channels == 32:
        return 'simple32'
    elif base_channels == 64:
        # 可能是标准UNet或无GAU的ChannelUNet
        # 检查conv6的输入通道数来判断
        conv6_keys = [k for k in state_dict.keys() if 'conv6' in k and 'weight' in k]
        if conv6_keys:
            conv6_weight = state_dict[conv6_keys[0]]
            # 如果conv6输入是192 (64*3), 说明是3路拼接
            if conv6_weight.shape[1] >= 192:
                return 'channel64'
            # 如果conv6输入是128 (64*2), 说明是2路拼接
            elif conv6_weight.shape[1] == 128:
                return 'simple64'  # 可能存在的中间版本
        return 'simple32'  # 默认返回simple32
    
    return 'unknown'


def load_unet_model(weights_path, device):
    """
    根据权重文件自动检测并加载对应的 UNet 模型
    """
    print(f"[Load] 正在加载 UNet 模型: {weights_path}")
    
    # 加载检查点
    checkpoint = torch.load(weights_path, map_location=device)
    
    # 检测架构
    arch = detect_unet_architecture(checkpoint)
    print(f"[Arch] 检测到架构: {arch}")
    
    # 获取state_dict
    if isinstance(checkpoint, dict):
        if 'state_dict' in checkpoint:
            state_dict = checkpoint['state_dict']
        elif 'model_state_dict' in checkpoint:
            state_dict = checkpoint['model_state_dict']
        else:
            state_dict = checkpoint
    else:
        state_dict = checkpoint
    
    # 根据架构创建模型
    if arch == 'simple32':
        model = SimpleUNet32(in_ch=3, out_ch=1)
    elif arch == 'channel64':
        model = ChannelUNet64(in_ch=3, out_ch=1)
    else:
        # 尝试加载为SimpleUNet32
        print(f"[Warn] 未知架构 {arch}, 尝试作为 SimpleUNet32 加载...")
        model = SimpleUNet32(in_ch=3, out_ch=1)
    
    # 加载权重
    try:
        model.load_state_dict(state_dict, strict=True)
        print(f"[OK] 权重加载成功 (strict=True)")
    except RuntimeError as e:
        print(f"[Warn] 严格加载失败,尝试宽松加载: {e}")
        model_dict = model.state_dict()
        pretrained_dict = {k: v for k, v in state_dict.items() if k in model_dict}
        model_dict.update(pretrained_dict)
        model.load_state_dict(model_dict)
        print(f"[OK] 宽松加载成功,加载了 {len(pretrained_dict)}/{len(model_dict)} 个参数")
    
    model.to(device)
    model.eval()
    
    return model, arch
